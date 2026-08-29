// Les seules lignes qu'on veut voir dans l'app.
export const LIGNES_AUTORISEES = ["1", "2", "3", "4", "CIT1", "CIT2"];

// Comparaison insensible à la casse et aux espaces/tirets :
// "CIT 1", "cit1", "Cit-1" matchent tous "CIT1".
export function normaliser(s) {
  return (s || "").toString().toUpperCase().replace(/[\s-]/g, "");
}
export const LIGNES_AUTORISEES_NORM = LIGNES_AUTORISEES.map(normaliser);

export function trierParOrdreAutorise(routeIds, lignesInfo) {
  return [...routeIds].sort(
    (a, b) =>
      LIGNES_AUTORISEES_NORM.indexOf(normaliser(lignesInfo[a]?.nom)) -
      LIGNES_AUTORISEES_NORM.indexOf(normaliser(lignesInfo[b]?.nom))
  );
}

// --- Petits utilitaires de stockage local, tolérants aux erreurs ---
export function lireStockage(cle) {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? JSON.parse(brut) : null;
  } catch (e) {
    return null;
  }
}
export function ecrireStockage(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch (e) {
    /* stockage indisponible, tant pis */
  }
}

// Formate un retard (en secondes) de façon lisible : en secondes en dessous
// d'une minute (évite les "0,3 min" peu parlants), en minutes arrondies au-delà.
export function formaterRetard(retardSecondes) {
  if (retardSecondes === null || retardSecondes === undefined) return null;
  const abs = Math.abs(retardSecondes);
  if (abs < 10) return "à l'heure";
  if (abs < 60) {
    const secs = Math.round(abs);
    return retardSecondes > 0 ? `retard de ${secs} s` : `avance de ${secs} s`;
  }
  const minutes = Math.round(abs / 60);
  return retardSecondes > 0 ? `retard de ${minutes} min` : `avance de ${minutes} min`;
}

// --- Ponctualité : catégorie + couleur d'un retard (en secondes) ---
// Sert à colorer la pastille des bus sur la carte d'un coup d'œil.
export const COULEUR_RETARD = {
  avance: "#1A73E8", // en avance sur l'horaire
  heure: "#2E7D32", // à l'heure (± 1 min)
  leger: "#E8A13C", // retard modéré (< 5 min)
  fort: "#C4432B", // retard important
  inconnu: "#5B6B72", // pas d'info de retard
};

export function categorieRetard(retardSecondes) {
  if (retardSecondes === null || retardSecondes === undefined) return "inconnu";
  if (retardSecondes <= -60) return "avance";
  if (retardSecondes < 60) return "heure";
  if (retardSecondes <= 300) return "leger";
  return "fort";
}

// --- Bus « fantôme » : position figée depuis trop longtemps ---
// Le flux renvoie parfois des véhicules dont l'horodatage ne bouge plus (bus au
// dépôt, perte de signal). On les repère pour ne pas afficher un temps
// d'attente calculé sur une position qui n'est plus vraie.
const SEUIL_FANTOME_SECONDES = 150;

export function agePosition(vehicule, maintenant = Date.now()) {
  if (!vehicule || !vehicule.horodatage) return null;
  return Math.max(0, Math.round(maintenant / 1000 - vehicule.horodatage));
}

export function busFantome(vehicule, maintenant = Date.now()) {
  const age = agePosition(vehicule, maintenant);
  return age !== null && age > SEUIL_FANTOME_SECONDES;
}

// En deçà, une position un peu ancienne (bus à l'arrêt, tunnel) n'a rien
// d'anormal ; au-delà de SEUIL_FANTOME_SECONDES elle ne bouge vraiment plus.
export const SEUIL_POSITION_ANCIENNE = 60;

// Diagnostic plus fin qu'un simple booléen « fantôme » :
// - "ok"           : position fraîche
// - "ancienne"     : figée depuis 1 à 2,5 min — on l'affiche mais on la nuance
// - "hors-service" : figée et plus aucun arrêt à venir → course terminée / dépôt
// - "signal-perdu" : figée alors qu'il reste des arrêts → perte de signal probable
export function etatPosition(vehicule, maintenant = Date.now()) {
  const age = agePosition(vehicule, maintenant);
  if (age === null || age <= SEUIL_POSITION_ANCIENNE) return "ok";
  if (age <= SEUIL_FANTOME_SECONDES) return "ancienne";
  const aDesArrets =
    Array.isArray(vehicule.prochains_arrets) && vehicule.prochains_arrets.length > 0;
  return aDesArrets ? "signal-perdu" : "hors-service";
}

export function formaterAge(secondes) {
  if (secondes === null || secondes === undefined) return "";
  if (secondes < 60) return `${secondes} s`;
  return `${Math.round(secondes / 60)} min`;
}

// --- Liens profonds / partage ---
// Une URL du type ?ligne=2&sens=0&arret=ABC ouvre l'app préfiltrée, voire le
// formulaire d'alerte prérempli (action=alerte). Symétrique de construireLien.
export function lireParametresUrl(recherche) {
  const params = new URLSearchParams(
    recherche ?? (typeof window !== "undefined" ? window.location.search : "")
  );
  const obj = {};
  ["ligne", "sens", "arret", "action"].forEach((cle) => {
    const valeur = params.get(cle);
    if (valeur) obj[cle] = valeur;
  });
  return obj;
}

export function construireLien(base, { ligne, sens, arret, action } = {}) {
  const params = new URLSearchParams();
  if (ligne) params.set("ligne", ligne);
  if (sens !== undefined && sens !== null && sens !== "") params.set("sens", String(sens));
  if (arret) params.set("arret", arret);
  if (action) params.set("action", action);
  const requete = params.toString();
  return requete ? `${base}?${requete}` : base;
}

// Partage natif si disponible, repli sur le presse-papier. Renvoie
// "partage" | "copie" | "echec" pour que l'appelant affiche le bon message.
export async function partagerLien(url, titre = "Bus Citibus") {
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: titre, url });
      return "partage";
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      return "copie";
    }
  } catch (e) {
    /* l'utilisateur a annulé, ou API indisponible */
  }
  return "echec";
}

// Un seul AudioContext réutilisé : en recréer un à chaque sonnerie fuyait des
// ressources et, sur iOS/Safari, un contexte tout neuf reste « suspendu » tant
// qu'un geste utilisateur ne l'a pas débloqué. Or l'alerte peut être réarmée
// automatiquement (récurrence) et sonner alors sans interaction : on débloque
// donc le contexte au premier tap via debloquerSon().
let _audioCtx = null;
function contexteAudio() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_audioCtx) {
    try {
      _audioCtx = new AC();
    } catch (e) {
      return null;
    }
  }
  if (_audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
  return _audioCtx;
}

// À câbler sur un vrai geste utilisateur (pointerdown/keydown) : « réveille »
// l'AudioContext pour que jouerSon() puisse encore émettre plus tard sans
// interaction.
export function debloquerSon() {
  contexteAudio();
}

export function jouerSon() {
  try {
    const ctx = contexteAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.7);
  } catch (e) {
    /* Web Audio indisponible, tant pis */
  }
}

// --- Regroupement des lignes en deux onglets ---
// "principales" = les lignes du réseau urbain listées ci-dessus,
// "autres"      = tout le reste du GTFS (scolaires, renforts, etc.).
export const GROUPE_PRINCIPALES = "principales";
export const GROUPE_AUTRES = "autres";

export function estLignePrincipale(nomOuInfo) {
  const nom = typeof nomOuInfo === "object" && nomOuInfo !== null ? nomOuInfo.nom : nomOuInfo;
  return LIGNES_AUTORISEES_NORM.includes(normaliser(nom));
}

// Tri « naturel » pour les autres lignes, dont les noms sont hétérogènes
// ("10", "S3", "TAD"…) : 2 doit venir avant 10, pas après.
export function trierParNom(routeIds, lignesInfo) {
  return [...routeIds].sort((a, b) =>
    (lignesInfo[a]?.nom || a).localeCompare(lignesInfo[b]?.nom || b, "fr", {
      numeric: true,
      sensitivity: "base",
    })
  );
}

// --- Recherche et distances (panneau des arrêts) ---

// Comparaison tolérante aux accents et à la casse : « gare » doit trouver
// « Gare SNCF », « eglise » doit trouver « Église ».
export function normaliserTexte(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Distance à vol d'oiseau en mètres (formule de haversine). Largement suffisant
// pour classer des arrêts par proximité.
export function distanceMetres(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formaterDistance(metres) {
  if (metres === null || metres === undefined) return "";
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1).replace(".", ",")} km`;
}

// Temps de marche estimé jusqu'à un arrêt (vitesse de marche moyenne ~4,5 km/h).
// Jamais moins d'une minute : « 0 min à pied » n'aide personne.
export function tempsMarcheMinutes(metres, vitesseKmh = 4.5) {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) return null;
  return Math.max(1, Math.round(metres / ((vitesseKmh * 1000) / 60)));
}

export function formaterTempsMarche(metres) {
  const min = tempsMarcheMinutes(metres);
  return min === null ? "" : `${min} min à pied`;
}

// --- Affluence à bord : couleur + libellé d'un niveau renvoyé par bus-data ---
export const COULEUR_OCCUPATION = {
  faible: "#2E7D32",
  moyen: "#E8A13C",
  fort: "#C4432B",
};
export const LIBELLE_OCCUPATION = {
  faible: "Peu de monde",
  moyen: "Bien rempli",
  fort: "Bondé",
};

// Les arrêts les plus proches d'une position (tableau de bord, liste des
// arrêts). `exclure` sert à ne pas répéter les arrêts déjà mis en favori.
export function arretsProches(arretsInfos, position, { exclure = [], limite = 5 } = {}) {
  if (!position || !arretsInfos) return [];
  const exclus = new Set(exclure);
  return Object.keys(arretsInfos)
    .filter((id) => !exclus.has(id))
    .map((id) => {
      const a = arretsInfos[id];
      return {
        stopId: id,
        nom: a.nom,
        lat: a.lat,
        lon: a.lon,
        pmr: a.pmr ?? null,
        distance: distanceMetres(position.lat, position.lon, a.lat, a.lon),
      };
    })
    .sort((x, y) => x.distance - y.distance)
    .slice(0, limite);
}

// Prochains passages à un arrêt, reconstitués depuis les bus en circulation.
// Utilisé à la fois par le popup de la carte et par le panneau des arrêts.
export function prochainsPassages(stopId, vehicules) {
  const passages = [];
  (vehicules || []).forEach((v) => {
    (v.prochains_arrets || []).forEach((a) => {
      if (a.stop_id !== stopId || !a.arrivee) return;
      const etaMinutes = (a.arrivee * 1000 - Date.now()) / 60000;
      if (etaMinutes < -1) return;
      passages.push({
        ligne: v.ligne,
        destination: v.destination,
        retard: a.retard,
        horairePrevu: a.horaire_prevu,
        eta: Math.max(0, Math.round(etaMinutes)),
        pmr: v.pmr ?? null,
        occupation: v.occupation || null,
      });
    });
  });
  return passages.sort((x, y) => x.eta - y.eta);
}
