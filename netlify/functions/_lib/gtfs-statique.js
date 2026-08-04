const AdmZip = require("adm-zip");

// Données théoriques (GTFS statique) de Citibus.
const GTFS_STATIQUE_URL =
  "https://s3.eu-west-1.amazonaws.com/files.orchestra.ratpdev.com/networks/narbonne/exports/scolaires-sans-tad.zip";

// Cache en mémoire, partagé par toutes les fonctions qui importent ce module
// tant que l'instance reste "chaude" entre deux appels.
let cache = null;

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

async function charger() {
  if (cache) return cache;

  const resp = await fetch(GTFS_STATIQUE_URL);
  if (!resp.ok) {
    throw new Error("Téléchargement GTFS statique échoué : " + resp.status);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  const zip = new AdmZip(buffer);

  const arrets = {}; // stop_id -> nom
  const arretsPosition = {}; // stop_id -> {nom, lat, lon}
  const lignes = {}; // route_id -> {nom, couleur}

  const stopsEntry = zip.getEntry("stops.txt");
  if (stopsEntry) {
    parseCsv(stopsEntry.getData().toString("utf8")).forEach((row) => {
      const nom = row.stop_name || row.stop_id;
      arrets[row.stop_id] = nom;
      const lat = parseFloat(row.stop_lat);
      const lon = parseFloat(row.stop_lon);
      if (row.stop_id && !isNaN(lat) && !isNaN(lon)) {
        arretsPosition[row.stop_id] = { nom, lat, lon };
      }
    });
  }

  const routesEntry = zip.getEntry("routes.txt");
  if (routesEntry) {
    parseCsv(routesEntry.getData().toString("utf8")).forEach((row) => {
      const nom = row.route_short_name || row.route_long_name || row.route_id;
      const couleur = row.route_color || "";
      lignes[row.route_id] = {
        nom: nom,
        couleur: couleur ? "#" + couleur : "#0078d4",
      };
    });
  }

  // trips.txt associe chaque trip_id à une ligne (route_id), un tracé (shape_id)
  // et une destination réelle (trip_headsign).
  const destinationsParTrip = {};
  const shapeIdParRouteDirection = {}; // "route_id|direction_id" -> Set(shape_id)
  const tripIdVersRoute = {}; // trip_id -> route_id (pour joindre stop_times.txt ensuite)
  const tripsEntry = zip.getEntry("trips.txt");
  if (tripsEntry) {
    parseCsv(tripsEntry.getData().toString("utf8")).forEach((row) => {
      if (row.trip_id && row.trip_headsign) {
        destinationsParTrip[row.trip_id] = row.trip_headsign;
      }
      if (row.trip_id && row.route_id) {
        tripIdVersRoute[row.trip_id] = row.route_id;
      }
      if (row.route_id && row.shape_id) {
        const dir = row.direction_id || "0";
        const cle = row.route_id + "|" + dir;
        if (!shapeIdParRouteDirection[cle]) shapeIdParRouteDirection[cle] = new Set();
        shapeIdParRouteDirection[cle].add(row.shape_id);
      }
    });
  }

  // shapes.txt contient les points géographiques de chaque tracé, à assembler
  // dans l'ordre de shape_pt_sequence pour dessiner l'itinéraire complet.
  const pointsParShape = {}; // shape_id -> [{seq, lat, lon}]
  const shapesEntry = zip.getEntry("shapes.txt");
  if (shapesEntry) {
    parseCsv(shapesEntry.getData().toString("utf8")).forEach((row) => {
      const lat = parseFloat(row.shape_pt_lat);
      const lon = parseFloat(row.shape_pt_lon);
      const seq = parseInt(row.shape_pt_sequence, 10);
      if (!row.shape_id || isNaN(lat) || isNaN(lon)) return;
      if (!pointsParShape[row.shape_id]) pointsParShape[row.shape_id] = [];
      pointsParShape[row.shape_id].push({ seq: isNaN(seq) ? 0 : seq, lat, lon });
    });
  }
  const shapes = {}; // shape_id -> [[lat, lon], ...] trié par séquence
  Object.keys(pointsParShape).forEach((shapeId) => {
    shapes[shapeId] = pointsParShape[shapeId]
      .sort((a, b) => a.seq - b.seq)
      .map((p) => [p.lat, p.lon]);
  });

  // Tracés par ligne ET par direction (permet un affichage plein/pointillé selon le sens)
  const tracesParLigne = {}; // route_id -> { direction_id: [[[lat,lon], ...], ...] }
  Object.keys(shapeIdParRouteDirection).forEach((cle) => {
    const separateurIdx = cle.lastIndexOf("|");
    const routeId = cle.slice(0, separateurIdx);
    const dir = cle.slice(separateurIdx + 1);
    if (!tracesParLigne[routeId]) tracesParLigne[routeId] = {};
    tracesParLigne[routeId][dir] = Array.from(shapeIdParRouteDirection[cle])
      .map((sid) => shapes[sid])
      .filter(Boolean);
  });

  // stop_times.txt : on ne garde que l'association route_id -> ensemble de
  // stop_id desservis (pas les horaires eux-mêmes, déjà couverts par le flux
  // temps réel), pour savoir quels arrêts afficher sur la carte par ligne.
  const arretIdsParRoute = {}; // route_id -> Set(stop_id)
  const stopTimesEntry = zip.getEntry("stop_times.txt");
  if (stopTimesEntry) {
    parseCsv(stopTimesEntry.getData().toString("utf8")).forEach((row) => {
      const routeId = tripIdVersRoute[row.trip_id];
      if (!routeId || !row.stop_id) return;
      if (!arretIdsParRoute[routeId]) arretIdsParRoute[routeId] = new Set();
      arretIdsParRoute[routeId].add(row.stop_id);
    });
  }
  const arretsParLigne = {}; // route_id -> [{stop_id, nom, lat, lon}, ...]
  Object.keys(arretIdsParRoute).forEach((routeId) => {
    arretsParLigne[routeId] = Array.from(arretIdsParRoute[routeId])
      .map((stopId) => (arretsPosition[stopId] ? { stop_id: stopId, ...arretsPosition[stopId] } : null))
      .filter(Boolean);
  });

  cache = {
    arrets,
    lignes,
    destinationsParTrip,
    tracesParLigne,
    arretsParLigne,
  };
  return cache;
}

module.exports = { charger, parseCsv };
