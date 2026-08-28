const { chargerBase, chargerHoraires, servicesActifs } = require("./_lib/gtfs-statique.js");

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

// Date (YYYYMMDD) et seconde du jour à Paris, indépendamment du fuseau du serveur.
function maintenantParis() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((o, p) => ((o[p.type] = p.value), o), {});

  const heure = Number(parts.hour) % 24; // certains moteurs renvoient "24" à minuit
  const dateYYYYMMDD = `${parts.year}${parts.month}${parts.day}`;
  const secondeDuJour = heure * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  const jourSemaine = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  ).getUTCDay();

  return { dateYYYYMMDD, secondeDuJour, jourSemaine };
}

function dateDecalee(dateYYYYMMDD, deltaJours) {
  const y = Number(dateYYYYMMDD.slice(0, 4));
  const m = Number(dateYYYYMMDD.slice(4, 6));
  const d = Number(dateYYYYMMDD.slice(6, 8));
  const t = new Date(Date.UTC(y, m - 1, d + deltaJours));
  const p = (n) => String(n).padStart(2, "0");
  return {
    date: `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}`,
    jour: t.getUTCDay(),
  };
}

function formaterHM(secondeDuJour) {
  const total = ((secondeDuJour % 86400) + 86400) % 86400;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
