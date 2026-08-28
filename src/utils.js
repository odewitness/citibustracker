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

export function jouerSon() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
      });
    });
  });
  return passages.sort((x, y) => x.eta - y.eta);
}
