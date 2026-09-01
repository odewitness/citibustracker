const AdmZip = require("adm-zip");

// Données théoriques (GTFS statique) de Citibus.
const GTFS_STATIQUE_URL =
  "https://s3.eu-west-1.amazonaws.com/files.orchestra.ratpdev.com/networks/narbonne/exports/scolaires-sans-tad.zip";

// Cache mémoire partagé par toutes les fonctions qui importent ce module, tant
// que l'instance Netlify reste « chaude » entre deux appels.
//
// Le parsing est découpé en trois étages : bus-data.js n'a besoin que des noms
// d'arrêts, des lignes et des destinations (chargerBase, sur stops/routes/trips),
// alors que shapes.txt et stop_times.txt — de loin les plus gros fichiers de
// l'archive — ne servent qu'au tracé du réseau (chargerReseau) et aux horaires
// théoriques (chargerHoraires). Les parser dans bus-data revenait à payer
// plusieurs secondes de démarrage à froid sur un appel répété toutes les 15 s.
//
// Durée de vie : l'archive GTFS distante est la seule source de vérité, tout le
// reste en est une fonction pure. Passé TTL_ARCHIVE_MS, le prochain appel renvoie
// immédiatement le cache courant ET déclenche en tâche de fond une revérification
// de l'archive (requête conditionnelle : pas de retéléchargement si l'offre n'a
// pas bougé). Chaque cache dérivé est estampillé du numéro de version de
// l'archive qui l'a produit ; dès qu'une nouvelle archive arrive, il est
// reconstruit au prochain accès. Sans ça, une fonction appelée en continu
// (bus-data) restait indéfiniment sur l'offre chargée à son démarrage : au
// changement d'offre (rentrée, trimestre), les horaires théoriques se
// rafraîchissaient — cold start fréquent de horaires-* — mais pas le temps réel.
const TTL_ARCHIVE_MS = 30 * 60 * 1000;

let cacheZip = null; // instance AdmZip courante
let zipVersion = 0; // incrémentée à chaque archive réellement nouvelle
let zipVerifieLe = 0; // Date.now() de la dernière vérification réussie (200 ou 304)
let zipLastModified = null; // en-têtes de l'archive en cache, pour la requête conditionnelle
let zipEtag = null;
let rafraichissementEnCours = false; // une seule revérification de fond à la fois

let cacheBase = null;
let cacheBaseVersion = -1;
let cacheReseau = null;
let cacheReseauVersion = -1;
let cacheHoraires = null;
let cacheHorairesVersion = -1;

// Chargements en cours : horaires-arret est appelée en rafale par le tableau de
// bord (un arrêt = un appel) dès qu'aucun bus ne circule. Sur une instance
// froide, sans déduplication, chaque appel re-téléchargeait et re-parsait
// l'archive en parallèle. On mémorise la promesse le temps du chargement ; en
// cas d'échec on la relâche pour permettre un nouvel essai.
let promesseZipInitial = null;
let promesseBase = null;
let promesseReseau = null;
let promesseHoraires = null;

// --- Archive distante : téléchargement, cache, revérification périodique. ---

// Télécharge l'archive. `entetes` porte une requête conditionnelle lors des
// revérifications ; un 304 renvoie { inchange: true } sans corps.
async function telechargerArchive(entetes) {
  const resp = await fetch(GTFS_STATIQUE_URL, entetes ? { headers: entetes } : undefined);
  if (resp.status === 304) return { inchange: true };
  if (!resp.ok) {
    throw new Error("Téléchargement GTFS statique échoué : " + resp.status);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  return {
    zip: new AdmZip(buffer),
    lastModified: resp.headers.get("last-modified"),
    etag: resp.headers.get("etag"),
  };
}

// Installe une archive fraîchement téléchargée. Si ses en-têtes de version sont
// identiques à celles en cache (S3 a répondu 200 en ignorant la requête
// conditionnelle), le contenu est le même : on ne touche pas à zipVersion, ce qui
// évite de reconstruire pour rien les caches dérivés.
function installerArchive(res) {
  if (!res || !res.zip) return;
  const memeVersion = cacheZip
    ? res.etag
      ? res.etag === zipEtag
      : !!res.lastModified && res.lastModified === zipLastModified
    : false;
  if (memeVersion) return;
  cacheZip = res.zip;
  zipVersion++;
  zipLastModified = res.lastModified;
  zipEtag = res.etag;
}

// Revérifie l'archive en tâche de fond (non bloquant). Un 304 ou un contenu
// inchangé repousse simplement la prochaine vérification ; un échec laisse le
// cache en place et sera réessayé au prochain appel (zipVerifieLe non avancé).
async function rafraichirArchive() {
  rafraichissementEnCours = true;
  try {
    const entetes = {};
    if (zipEtag) entetes["If-None-Match"] = zipEtag;
    else if (zipLastModified) entetes["If-Modified-Since"] = zipLastModified;
    const res = await telechargerArchive(entetes);
    if (!res.inchange) installerArchive(res);
    zipVerifieLe = Date.now();
  } catch (e) {
    /* réseau indisponible ou 5xx : on garde l'archive courante */
  } finally {
    rafraichissementEnCours = false;
  }
}

function reverifierArchiveSiPerimee() {
  if (!cacheZip || rafraichissementEnCours) return;
  if (Date.now() - zipVerifieLe <= TTL_ARCHIVE_MS) return;
  rafraichirArchive(); // lance la tâche de fond, sans l'attendre
}

// wheelchair_boarding (stops.txt) / wheelchair_accessible (trips.txt) :
// 1 = accessible en fauteuil, 2 = non accessible, 0 ou absent = information
// inconnue. On garde la distinction non-accessible / inconnu : « pas d'info »
// ne doit pas se lire comme « accessible ».
function interpreterAcces(valeur) {
  if (valeur === "1" || valeur === 1) return true;
  if (valeur === "2" || valeur === 2) return false;
  return null;
}

function splitCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] || "").trim()));
    return obj;
  });
}

function ouvrirZip() {
  if (cacheZip) {
    reverifierArchiveSiPerimee();
    return Promise.resolve(cacheZip);
  }
  // Tout premier chargement : bloquant, dédupliqué entre appels concurrents.
  if (!promesseZipInitial) {
    promesseZipInitial = telechargerArchive()
      .then((res) => {
        installerArchive(res);
        zipVerifieLe = Date.now();
        return cacheZip;
      })
      .finally(() => {
        promesseZipInitial = null;
      });
  }
  return promesseZipInitial;
}

// Lit une entrée du ZIP, ou [] si le fichier est absent de l'archive.
function lireTable(zip, nomFichier) {
  const entree = zip.getEntry(nomFichier);
  return entree ? parseCsv(entree.getData().toString("utf8")) : [];
}

// Choisit, parmi plusieurs libellés observés, le plus fréquent : une même
// direction porte parfois des trip_headsign légèrement différents selon les
// courses, on veut la destination habituelle.
function libelleMajoritaire(compteurs) {
  let meilleur = null;
  let meilleurNombre = -1;
  compteurs.forEach((nombre, libelle) => {
    if (nombre > meilleurNombre) {
      meilleur = libelle;
      meilleurNombre = nombre;
    }
  });
  return meilleur;
}

// --- Socle : arrêts, lignes, destinations. Rapide (petits fichiers). ---
function chargerBase() {
  reverifierArchiveSiPerimee();
  if (cacheBase && cacheBaseVersion === zipVersion) return Promise.resolve(cacheBase);
  if (!promesseBase) {
    promesseBase = _chargerBase().finally(() => {
      promesseBase = null;
    });
  }
  return promesseBase;
}
async function _chargerBase() {
  const zip = await ouvrirZip();
  const version = zipVersion; // version de l'archive qu'on vient d'obtenir

  const arrets = {}; // stop_id -> nom
  const arretsPosition = {}; // stop_id -> {nom, lat, lon}
  lireTable(zip, "stops.txt").forEach((row) => {
    const nom = row.stop_name || row.stop_id;
    arrets[row.stop_id] = nom;
    const lat = parseFloat(row.stop_lat);
    const lon = parseFloat(row.stop_lon);
    if (row.stop_id && !isNaN(lat) && !isNaN(lon)) {
      arretsPosition[row.stop_id] = { nom, lat, lon, pmr: interpreterAcces(row.wheelchair_boarding) };
    }
  });

  const lignes = {}; // route_id -> {nom, couleur}
  lireTable(zip, "routes.txt").forEach((row) => {
    const nom = row.route_short_name || row.route_long_name || row.route_id;
    const couleur = row.route_color || "";
    lignes[row.route_id] = { nom: nom, couleur: couleur ? "#" + couleur : "#0078d4" };
  });

  // trips.txt associe chaque trip_id à une ligne (route_id), un sens
  // (direction_id), un tracé (shape_id) et une destination (trip_headsign).
  const destinationsParTrip = {};
  const pmrParTrip = {}; // trip_id -> true | false (accessibilité UFR ; absent si inconnue)
  const tripIdVersCle = {}; // trip_id -> "route_id|direction_id"
  const shapeIdParCle = {}; // "route_id|direction_id" -> Set(shape_id)
  const libellesParCle = {}; // "route_id|direction_id" -> Map(headsign -> nombre)

  lireTable(zip, "trips.txt").forEach((row) => {
    if (!row.trip_id) return;
    if (row.trip_headsign) destinationsParTrip[row.trip_id] = row.trip_headsign;
    const acces = interpreterAcces(row.wheelchair_accessible);
    if (acces !== null) pmrParTrip[row.trip_id] = acces;
    if (!row.route_id) return;

    const dir = row.direction_id || "0";
    const cle = row.route_id + "|" + dir;
    tripIdVersCle[row.trip_id] = cle;

    if (row.shape_id) {
      if (!shapeIdParCle[cle]) shapeIdParCle[cle] = new Set();
      shapeIdParCle[cle].add(row.shape_id);
    }
    if (row.trip_headsign) {
      if (!libellesParCle[cle]) libellesParCle[cle] = new Map();
      const compteurs = libellesParCle[cle];
      compteurs.set(row.trip_headsign, (compteurs.get(row.trip_headsign) || 0) + 1);
    }
  });

  // Sens desservis par ligne, avec leur destination habituelle : c'est ce qui
  // permet au panneau d'alerte de proposer une direction même quand aucun bus
  // ne circule (tôt le matin, le dimanche…).
  const directionsParLigne = {}; // route_id -> [[direction_id, libellé], ...]
  Object.keys(tripIdVersCle).forEach((tripId) => {
    const cle = tripIdVersCle[tripId];
    const separateur = cle.lastIndexOf("|");
    const routeId = cle.slice(0, separateur);
    const dir = cle.slice(separateur + 1);
    if (!directionsParLigne[routeId]) directionsParLigne[routeId] = {};
    if (!directionsParLigne[routeId][dir]) {
      directionsParLigne[routeId][dir] =
        libelleMajoritaire(libellesParCle[cle] || new Map()) || "Sens " + dir;
    }
  });
  Object.keys(directionsParLigne).forEach((routeId) => {
    directionsParLigne[routeId] = Object.keys(directionsParLigne[routeId])
      .sort()
      .map((dir) => [dir, directionsParLigne[routeId][dir]]);
  });

  cacheBase = {
    arrets,
    arretsPosition,
    lignes,
    destinationsParTrip,
    pmrParTrip,
    directionsParLigne,
    tripIdVersCle,
    shapeIdParCle,
  };
  cacheBaseVersion = version;
  return cacheBase;
}

// --- Réseau : tracés et arrêts desservis. Lourd (shapes.txt + stop_times.txt). ---
function chargerReseau() {
  reverifierArchiveSiPerimee();
  if (cacheReseau && cacheReseauVersion === zipVersion) return Promise.resolve(cacheReseau);
  if (!promesseReseau) {
    promesseReseau = _chargerReseau().finally(() => {
      promesseReseau = null;
    });
  }
  return promesseReseau;
}
async function _chargerReseau() {
  const { arretsPosition, tripIdVersCle, shapeIdParCle } = await chargerBase();
  // On dérive du socle qu'on vient de charger : même archive, donc on l'estampille
  // de la même version. Si une nouvelle archive est arrivée entre-temps, le socle
  // sera d'une version antérieure à zipVersion et ce cache sera reconstruit au
  // prochain accès — pas de figement silencieux.
  const zip = cacheZip;
  const version = cacheBaseVersion;

  // shapes.txt : points géographiques de chaque tracé, à assembler dans l'ordre
  // de shape_pt_sequence pour dessiner l'itinéraire complet.
  const pointsParShape = {};
  lireTable(zip, "shapes.txt").forEach((row) => {
    const lat = parseFloat(row.shape_pt_lat);
    const lon = parseFloat(row.shape_pt_lon);
    const seq = parseInt(row.shape_pt_sequence, 10);
    if (!row.shape_id || isNaN(lat) || isNaN(lon)) return;
    if (!pointsParShape[row.shape_id]) pointsParShape[row.shape_id] = [];
    pointsParShape[row.shape_id].push({ seq: isNaN(seq) ? 0 : seq, lat, lon });
  });
  // Les coordonnées sont arrondies à 5 décimales (~1 m) : la précision brute du
  // GTFS n'apporte rien à l'écran et pèse lourd dans la réponse.
  const arrondir = (n) => Math.round(n * 1e5) / 1e5;
  const shapes = {};
  Object.keys(pointsParShape).forEach((shapeId) => {
    shapes[shapeId] = pointsParShape[shapeId]
      .sort((a, b) => a.seq - b.seq)
      .map((p) => [arrondir(p.lat), arrondir(p.lon)]);
  });

  const tracesParLigne = {}; // route_id -> { direction_id: [[[lat,lon], ...], ...] }
  Object.keys(shapeIdParCle).forEach((cle) => {
    const separateur = cle.lastIndexOf("|");
    const routeId = cle.slice(0, separateur);
    const dir = cle.slice(separateur + 1);
    if (!tracesParLigne[routeId]) tracesParLigne[routeId] = {};
    tracesParLigne[routeId][dir] = Array.from(shapeIdParCle[cle])
      .map((sid) => shapes[sid])
      .filter(Boolean);
  });

  // stop_times.txt : on ne garde pas les horaires (déjà couverts par le temps
  // réel), seulement la séquence d'arrêts de chaque course. Pour chaque
  // ligne+sens on retient la course la plus complète : elle sert de desserte de
  // référence, dans l'ordre du trajet — bien plus lisible qu'une liste triée
  // par ordre alphabétique dans le sélecteur d'arrêt.
  const arretsParTrip = {};
  lireTable(zip, "stop_times.txt").forEach((row) => {
    if (!row.trip_id || !row.stop_id || !tripIdVersCle[row.trip_id]) return;
    const seq = parseInt(row.stop_sequence, 10);
    if (!arretsParTrip[row.trip_id]) arretsParTrip[row.trip_id] = [];
    arretsParTrip[row.trip_id].push({ seq: isNaN(seq) ? 0 : seq, stopId: row.stop_id });
  });

  const courseDeReference = {}; // cle -> trip_id
  Object.keys(arretsParTrip).forEach((tripId) => {
    const cle = tripIdVersCle[tripId];
    if (!cle) return;
    const actuelle = courseDeReference[cle];
    if (!actuelle || arretsParTrip[tripId].length > arretsParTrip[actuelle].length) {
      courseDeReference[cle] = tripId;
    }
  });

  // On ne transporte que des identifiants d'arrêts : leurs nom et coordonnées
  // sont envoyés une seule fois dans un dictionnaire commun (arretsPosition),
  // au lieu d'être répétés pour chaque ligne et chaque sens qui les desservent.
  const arretsParLigneDirection = {}; // "route_id|direction_id" -> [stop_id, ...]
  const arretIdsParRoute = {}; // route_id -> Set(stop_id)
  Object.keys(courseDeReference).forEach((cle) => {
    const routeId = cle.slice(0, cle.lastIndexOf("|"));
    const ordonnes = arretsParTrip[courseDeReference[cle]]
      .sort((a, b) => a.seq - b.seq)
      .map((a) => a.stopId)
      .filter((stopId) => arretsPosition[stopId]);
    arretsParLigneDirection[cle] = ordonnes;
    if (!arretIdsParRoute[routeId]) arretIdsParRoute[routeId] = new Set();
    ordonnes.forEach((stopId) => arretIdsParRoute[routeId].add(stopId));
  });

  const arretsParLigne = {}; // route_id -> [stop_id, ...]
  Object.keys(arretIdsParRoute).forEach((routeId) => {
    arretsParLigne[routeId] = Array.from(arretIdsParRoute[routeId]);
  });

  cacheReseau = { tracesParLigne, arretsParLigne, arretsParLigneDirection };
  cacheReseauVersion = version;
  return cacheReseau;
}

// --- Horaires théoriques : heures de passage par arrêt + calendrier. ---
// Sert la fiche horaire d'un arrêt quand aucun bus ne circule (tôt le matin,
// le soir, le dimanche) — précisément le moment où on en a besoin.
// stop_times.txt est volumineux : cette étape n'est chargée que par la fonction
// dédiée, jamais par le poll temps réel.

// "H:MM:SS" (parfois > 24h pour les courses après minuit) → secondes depuis minuit.
function versSecondes(hms) {
  if (!hms) return null;
  const m = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(hms.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function chargerHoraires() {
  reverifierArchiveSiPerimee();
  if (cacheHoraires && cacheHorairesVersion === zipVersion) return Promise.resolve(cacheHoraires);
  if (!promesseHoraires) {
    promesseHoraires = _chargerHoraires().finally(() => {
      promesseHoraires = null;
    });
  }
  return promesseHoraires;
}
async function _chargerHoraires() {
  const zip = await ouvrirZip();
  const version = zipVersion;

  // trip_id -> ligne / sens / service / destination
  const infoTrip = {};
  lireTable(zip, "trips.txt").forEach((row) => {
    if (!row.trip_id) return;
    infoTrip[row.trip_id] = {
      routeId: row.route_id || "",
      directionId: row.direction_id || "0",
      serviceId: row.service_id || "",
      headsign: row.trip_headsign || "",
      pmr: interpreterAcces(row.wheelchair_accessible),
    };
  });

  const horairesParArret = {}; // stop_id -> [{ sec, routeId, directionId, serviceId, headsign, pmr }]
  const premierSecParTrip = {}; // trip_id -> heure de départ (plus petit sec de la course)
  lireTable(zip, "stop_times.txt").forEach((row) => {
    if (!row.trip_id || !row.stop_id) return;
    const info = infoTrip[row.trip_id];
    if (!info) return;
    const sec = versSecondes(row.departure_time || row.arrival_time);
    if (sec === null) return;
    if (!horairesParArret[row.stop_id]) horairesParArret[row.stop_id] = [];
    horairesParArret[row.stop_id].push({
      sec,
      routeId: info.routeId,
      directionId: info.directionId,
      serviceId: info.serviceId,
      headsign: info.headsign,
      pmr: info.pmr,
    });
    if (premierSecParTrip[row.trip_id] === undefined || sec < premierSecParTrip[row.trip_id]) {
      premierSecParTrip[row.trip_id] = sec;
    }
  });
  Object.keys(horairesParArret).forEach((id) =>
    horairesParArret[id].sort((a, b) => a.sec - b.sec)
  );

  // Heure de départ de chaque course par ligne : sert la fiche « ligne en
  // direct » quand aucun bus ne circule (nuit, dimanche) pour annoncer le
  // prochain départ théorique, y compris le lendemain.
  const departsParLigne = {}; // route_id -> [{ sec, directionId, serviceId, headsign, pmr }]
  Object.keys(premierSecParTrip).forEach((tripId) => {
    const info = infoTrip[tripId];
    if (!info || !info.routeId) return;
    if (!departsParLigne[info.routeId]) departsParLigne[info.routeId] = [];
    departsParLigne[info.routeId].push({
      sec: premierSecParTrip[tripId],
      directionId: info.directionId,
      serviceId: info.serviceId,
      headsign: info.headsign,
      pmr: info.pmr,
    });
  });
  Object.keys(departsParLigne).forEach((id) =>
    departsParLigne[id].sort((a, b) => a.sec - b.sec)
  );

  // calendar.txt : jours de circulation réguliers de chaque service.
  // L'index 0 = dimanche, pour coller à Date.getDay()/getUTCDay().
  const calendrier = lireTable(zip, "calendar.txt").map((row) => ({
    serviceId: row.service_id,
    jours: [
      row.sunday,
      row.monday,
      row.tuesday,
      row.wednesday,
      row.thursday,
      row.friday,
      row.saturday,
    ].map((v) => v === "1"),
    debut: row.start_date || "",
    fin: row.end_date || "",
  }));

  // calendar_dates.txt : exceptions (1 = service ajouté ce jour, 2 = retiré).
  const exceptions = {}; // "serviceId|YYYYMMDD" -> "1" | "2"
  lireTable(zip, "calendar_dates.txt").forEach((row) => {
    if (!row.service_id || !row.date) return;
    exceptions[row.service_id + "|" + row.date] = row.exception_type;
  });

  cacheHoraires = { horairesParArret, departsParLigne, calendrier, exceptions };
  cacheHorairesVersion = version;
  return cacheHoraires;
}

// Ensemble des service_id actifs à une date donnée (YYYYMMDD, jourSemaine 0-6
// avec 0 = dimanche).
function servicesActifs(horaires, dateYYYYMMDD, jourSemaine) {
  const actifs = new Set();
  (horaires.calendrier || []).forEach((c) => {
    const dansPeriode =
      (!c.debut || dateYYYYMMDD >= c.debut) && (!c.fin || dateYYYYMMDD <= c.fin);
    if (dansPeriode && c.jours[jourSemaine]) actifs.add(c.serviceId);
  });
  Object.keys(horaires.exceptions || {}).forEach((cle) => {
    const sep = cle.lastIndexOf("|");
    if (cle.slice(sep + 1) !== dateYYYYMMDD) return;
    const serviceId = cle.slice(0, sep);
    if (horaires.exceptions[cle] === "1") actifs.add(serviceId);
    else if (horaires.exceptions[cle] === "2") actifs.delete(serviceId);
  });
  return actifs;
}

module.exports = {
  chargerBase,
  chargerReseau,
  chargerHoraires,
  servicesActifs,
  versSecondes,
  parseCsv,
  interpreterAcces,
};
