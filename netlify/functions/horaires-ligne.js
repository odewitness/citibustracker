const { chargerBase, chargerHoraires, servicesActifs } = require("./_lib/gtfs-statique.js");
const { maintenantParis, dateDecalee, formaterHM } = require("./_lib/temps-paris.js");

// Prochains départs THÉORIQUES d'une ligne, d'après le GTFS statique. Sert la
// fiche « ligne en direct » quand aucun bus ne circule : on annonce alors le
// prochain départ prévu au calendrier, y compris s'il tombe le lendemain (nuit,
// dimanche, coupure de mi-journée).
//
// Appel : /.netlify/functions/horaires-ligne?ligne=<route_id>

const NB_MAX = 10;
const FENETRE_MAX_MIN = 36 * 60; // on n'annonce rien au-delà de 36 h

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

// Départs à venir, balayés sur j-1 (queue des courses après minuit) à j+2.
// `servicesPourDate(dateYYYYMMDD, jourSemaine)` renvoie le Set des service_id
// actifs ce jour-là — injecté pour rester testable sans archive GTFS.
function collecterDeparts(departs, dateYYYYMMDD, secondeDuJour, servicesPourDate) {
  const collecte = [];
  for (const offset of [-1, 0, 1, 2]) {
    const j = dateDecalee(dateYYYYMMDD, offset);
    const services = servicesPourDate(j.date, j.jour);
    for (const d of departs) {
      // Une course à heure >= 24:00:00 appartient au service du jour PRÉCÉDENT :
      // on ne la regarde que via l'itération j-1 (sa vraie date est j).
      const apresMinuit = d.sec >= 86400;
      if (offset === -1 && !apresMinuit) continue;
      if (!services.has(d.serviceId)) continue;

      const secDepuisAujourdhui = offset * 86400 + d.sec;
      const dans = Math.round((secDepuisAujourdhui - secondeDuJour) / 60);
      if (dans < -1 || dans > FENETRE_MAX_MIN) continue;

      collecte.push({
        direction: d.directionId,
        destination: d.headsign || null,
        heure: formaterHM(d.sec),
        dans,
        demain: secDepuisAujourdhui >= 86400,
        pmr: d.pmr ?? null,
      });
    }
    // Dès qu'un jour « réel » (aujourd'hui, puis demain…) fournit des départs,
    // inutile de continuer : on ne veut pas répéter la même reprise 06:00 pour
    // chaque jour suivant. j-1 ne sert qu'à ramasser la queue après minuit.
    if (offset >= 0 && collecte.length > 0) break;
  }

  collecte.sort((a, b) => a.dans - b.dans);

  // Des services qui se chevauchent peuvent produire deux fois le même départ.
  const vus = new Set();
  const passages = [];
  for (const p of collecte) {
    const cle = p.direction + "|" + p.dans;
    if (vus.has(cle)) continue;
    vus.add(cle);
    passages.push(p);
  }
  return passages;
}

exports.handler = async function (event) {
  try {
    const routeId = event.queryStringParameters && event.queryStringParameters.ligne;
    if (!routeId) return reponse(400, { erreur: "Paramètre 'ligne' requis" });

    const { lignes } = await chargerBase();
    const horaires = await chargerHoraires();
    const departs = horaires.departsParLigne[routeId] || [];
    const info = lignes[routeId] || {};

    const { dateYYYYMMDD, secondeDuJour } = maintenantParis();
    const passages = collecterDeparts(departs, dateYYYYMMDD, secondeDuJour, (date, jour) =>
      servicesActifs(horaires, date, jour)
    );

    // Le tout premier départ de chaque sens : l'info clé quand la ligne est à
    // l'arrêt (« reprise → Gare à 06:12 »).
    const premiersParSens = {};
    for (const p of passages) {
      if (!premiersParSens[p.direction]) premiersParSens[p.direction] = p;
    }

    return reponse(
      200,
      {
        route_id: routeId,
        ligne: info.nom || routeId,
        couleur: info.couleur || null,
        date: dateYYYYMMDD,
        passages: passages.slice(0, NB_MAX),
        premiers_par_sens: premiersParSens,
      },
      300
    );
  } catch (e) {
    return reponse(500, { erreur: String(e && e.message ? e.message : e) });
  }
};

// Exposé pour les tests unitaires.
exports.collecterDeparts = collecterDeparts;
