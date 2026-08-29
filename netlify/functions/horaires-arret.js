const { chargerBase, chargerHoraires, servicesActifs } = require("./_lib/gtfs-statique.js");
const { maintenantParis, dateDecalee, formaterHM } = require("./_lib/temps-paris.js");

// Fiche horaire théorique d'un arrêt : les prochains passages prévus d'après le
// GTFS statique, filtrés par le calendrier du jour. Complète le temps réel quand
// aucun bus ne circule (aube, soirée, dimanche).
//
// Appel : /.netlify/functions/horaires-arret?arret=<stop_id>[&fenetre=<minutes>]

const FENETRE_DEFAUT = 120; // minutes
const NB_MAX = 12;

function reponse(code, corps, maxAge = 0) {
  return {
    statusCode: code,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(corps),
  };
}

// Dernier passage de la journée d'exploitation pour chaque ligne+sens desservant
// l'arrêt : le plus tardif parmi les services actifs (les courses après minuit,
// heure ≥ 24:00:00, comptent comme les plus tardives). Renvoie un Set de clés
// "routeId|directionId|sec" — celles à signaler d'un « dernier bus ».
function derniersPassages(passagesArret, servicesAujourdhui, servicesVeille) {
  const maxParCle = new Map(); // "routeId|directionId" -> sec le plus tardif
  for (const p of passagesArret) {
    const actif =
      p.sec >= 86400 ? servicesVeille.has(p.serviceId) : servicesAujourdhui.has(p.serviceId);
    if (!actif) continue;
    const cle = p.routeId + "|" + p.directionId;
    if (!maxParCle.has(cle) || p.sec > maxParCle.get(cle)) maxParCle.set(cle, p.sec);
  }
  const derniers = new Set();
  for (const [cle, sec] of maxParCle) derniers.add(cle + "|" + sec);
  return derniers;
}

exports.handler = async function (event) {
  try {
    const stopId = event.queryStringParameters && event.queryStringParameters.arret;
    if (!stopId) return reponse(400, { erreur: "Paramètre 'arret' requis" });

    const fenetreMin =
      Number(event.queryStringParameters && event.queryStringParameters.fenetre) || FENETRE_DEFAUT;
    const fenetreSec = Math.min(Math.max(fenetreMin, 15), 24 * 60) * 60;

    const { arrets, lignes, arretsPosition } = await chargerBase();
    const horaires = await chargerHoraires();
    const passagesArret = horaires.horairesParArret[stopId] || [];

    const { dateYYYYMMDD, secondeDuJour, jourSemaine } = maintenantParis();
    const servicesAujourdhui = servicesActifs(horaires, dateYYYYMMDD, jourSemaine);
    // Courses passées minuit : elles appartiennent au service de la veille et
    // portent une heure ≥ 24:00:00.
    const veille = dateDecalee(dateYYYYMMDD, -1);
    const servicesVeille = servicesActifs(horaires, veille.date, veille.jour);
    const derniers = derniersPassages(passagesArret, servicesAujourdhui, servicesVeille);

    const resultats = [];
    for (const p of passagesArret) {
      let delta;
      if (p.sec >= 86400) {
        if (!servicesVeille.has(p.serviceId)) continue;
        delta = p.sec - 86400 - secondeDuJour;
      } else {
        if (!servicesAujourdhui.has(p.serviceId)) continue;
        delta = p.sec - secondeDuJour;
      }
      if (delta < -60 || delta > fenetreSec) continue;

      const info = lignes[p.routeId] || {};
      resultats.push({
        routeId: p.routeId,
        ligne: info.nom || p.routeId,
        couleur: info.couleur || null,
        direction: p.directionId,
        destination: p.headsign || null,
        heure: formaterHM(p.sec),
        heure_sec: p.sec % 86400,
        dans: Math.round(delta / 60),
        dernier: derniers.has(p.routeId + "|" + p.directionId + "|" + p.sec),
        pmr: p.pmr ?? null,
      });
    }
    resultats.sort((a, b) => a.dans - b.dans);

    return reponse(
      200,
      {
        stop_id: stopId,
        arret: arrets[stopId] || stopId,
        pmr_arret: (arretsPosition[stopId] || {}).pmr ?? null,
        date: dateYYYYMMDD,
        passages: resultats.slice(0, NB_MAX),
      },
      60
    );
  } catch (e) {
    return reponse(500, { erreur: String(e && e.message ? e.message : e) });
  }
};

// Exposé pour les tests unitaires.
exports.derniersPassages = derniersPassages;
