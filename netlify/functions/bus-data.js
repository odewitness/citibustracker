const protobuf = require("gtfs-realtime-bindings");
const { chargerBase } = require("./_lib/gtfs-statique.js");

// Flux temps réel (positions des bus + horaires)
const FEED_URL = "https://feed-citibus-narbonne.ratpdev.com/GTFS-RT/gtfs-rt.bin";

// Libellés lisibles des effets d'une alerte trafic (enum GTFS-RT Alert.Effect).
const EFFETS = {
  NO_SERVICE: "Ligne interrompue",
  REDUCED_SERVICE: "Service réduit",
  SIGNIFICANT_DELAYS: "Retards importants",
  DETOUR: "Déviation",
  ADDITIONAL_SERVICE: "Service renforcé",
  MODIFIED_SERVICE: "Service modifié",
  STOP_MOVED: "Arrêt déplacé",
  NO_EFFECT: "Information",
  ACCESSIBILITY_ISSUE: "Accessibilité réduite",
};

// protobuf.js décode les enum en nombre : on retrouve le nom via la table
// de l'enum pour tolérer aussi bien 4 que "DETOUR".
const NOMS_EFFET = protobuf.transit_realtime.Alert.Effect || {};
function nomEffet(valeur) {
  if (typeof valeur === "string") return valeur;
  return Object.keys(NOMS_EFFET).find((nom) => NOMS_EFFET[nom] === valeur) || null;
}

// Un champ TranslatedString GTFS-RT porte plusieurs traductions : on prend le
// français si présent, sinon la première disponible.
function texteTraduit(champ) {
  const traductions = champ && champ.translation;
  if (!traductions || traductions.length === 0) return "";
  const fr = traductions.find((t) => (t.language || "").toLowerCase().startsWith("fr"));
  return (fr || traductions[0]).text || "";
}

// Extrait les alertes trafic (entity.alert) du flux : déviations, arrêts non
// desservis, lignes suspendues… Jusque-là décodées mais jamais exploitées.
function extraireAlertes(feed, nomsArrets) {
  const maintenant = Math.floor(Date.now() / 1000);
  const alertes = [];

  feed.entity.forEach((entity) => {
    const a = entity.alert;
    if (!a) return;

    // Une alerte sans période active est considérée en cours ; sinon il faut
    // qu'au moins une fenêtre couvre l'instant présent.
    const periodes = a.activePeriod || [];
    const active =
      periodes.length === 0 ||
      periodes.some((p) => {
        const debut = p.start ? Number(p.start) : 0;
        const fin = p.end ? Number(p.end) : Infinity;
        return debut <= maintenant && maintenant <= fin;
      });
    if (!active) return;

    const lignes = [];
    const arrets = [];
    (a.informedEntity || []).forEach((cible) => {
      if (cible.routeId && !lignes.includes(String(cible.routeId))) {
        lignes.push(String(cible.routeId));
      }
      if (cible.stopId && !arrets.some((s) => s.stopId === cible.stopId)) {
        arrets.push({ stopId: cible.stopId, nom: nomsArrets[cible.stopId] || cible.stopId });
      }
    });

    const titre = texteTraduit(a.headerText);
    const description = texteTraduit(a.descriptionText);
    if (!titre && !description) return;

    const cleEffet = nomEffet(a.effect);
    alertes.push({
      id: entity.id || `${titre}|${lignes.join(",")}`,
      effet: (cleEffet && EFFETS[cleEffet]) || null,
      effetBrut: cleEffet,
      titre,
      description,
      url: texteTraduit(a.url) || null,
      lignes,
      arrets,
      debut: periodes[0]?.start ? Number(periodes[0].start) : null,
      fin: periodes[0]?.end ? Number(periodes[0].end) : null,
    });
  });

  return alertes;
}

exports.handler = async function () {
  try {
    // Socle seulement : cette fonction est appelée toutes les 15 s, elle n'a
    // aucun besoin des tracés ni de la desserte complète.
    const { arrets, lignes, destinationsParTrip } = await chargerBase();

    const resp = await fetch(FEED_URL);
    if (!resp.ok) {
      throw new Error("Téléchargement flux temps réel échoué : " + resp.status);
    }
    const arrayBuffer = await resp.arrayBuffer();
    const feed = protobuf.transit_realtime.FeedMessage.decode(new Uint8Array(arrayBuffer));

    const horaires = {};
    feed.entity.forEach((entity) => {
      if (entity.tripUpdate && entity.tripUpdate.vehicle && entity.tripUpdate.vehicle.id) {
        horaires[entity.tripUpdate.vehicle.id] = entity.tripUpdate;
      }
    });

    const vehicules = [];
    feed.entity.forEach((entity) => {
      if (!entity.vehicle) return;
      const v = entity.vehicle;
      const vid = v.vehicle && v.vehicle.id;
      if (!vid) return;
      const p = v.position || {};

      let prochainArret = null;
      let retard = null;
      let prochainsArrets = [];

      // 1. On se base en priorité sur l'arrêt indiqué directement dans la
      // position GPS du véhicule (VehiclePosition.stop_id) : contrairement à
      // la liste stopTimeUpdate ci-dessous, ce champ est mis à jour au même
      // rythme que la position elle-même, donc toujours synchronisé avec le
      // point affiché sur la carte.
      const stopIdActuel = v.stopId;
      const seqActuelle = v.currentStopSequence;
      if (stopIdActuel) {
        prochainArret = arrets[stopIdActuel] || stopIdActuel;
      }

      // 2. On reconstruit la liste des arrêts à venir (avec heure d'arrivée
      // prévue) à partir de stopTimeUpdate, en repartant du même arrêt/séquence
      // que la position GPS pour ne pas inclure d'arrêts déjà dépassés.
      const tu = horaires[vid];
      if (tu && tu.stopTimeUpdate && tu.stopTimeUpdate.length > 0) {
        let idxDepart = -1;
        if (seqActuelle) {
          idxDepart = tu.stopTimeUpdate.findIndex((s) => s.stopSequence >= seqActuelle);
        } else if (stopIdActuel) {
          idxDepart = tu.stopTimeUpdate.findIndex((s) => s.stopId === stopIdActuel);
        }
        if (idxDepart === -1) idxDepart = 0;

        const aVenir = tu.stopTimeUpdate.slice(idxDepart);
        prochainsArrets = aVenir.map((s) => {
          const epoch = (s.arrival && s.arrival.time) || (s.departure && s.departure.time) || null;
          const delaiSecondes =
            (s.arrival && typeof s.arrival.delay === "number" && s.arrival.delay) ||
            (s.departure && typeof s.departure.delay === "number" && s.departure.delay) ||
            0;
          // L'heure théorique (horaire de la fiche horaire) = heure prédite moins le retard actuel.
          const epochTheorique = epoch ? Number(epoch) - delaiSecondes : null;
          const horairePrevu = epochTheorique
            ? new Date(epochTheorique * 1000).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Paris",
              })
            : null;
          return {
            stop_id: s.stopId,
            nom: arrets[s.stopId] || s.stopId,
            arrivee: epoch ? Number(epoch) : null,
            retard: epoch ? delaiSecondes : null,
            horaire_prevu: horairePrevu,
          };
        });

        const entree = aVenir[0];
        if (!prochainArret) {
          prochainArret = arrets[entree.stopId] || entree.stopId;
        }
        if (entree.arrival && typeof entree.arrival.delay === "number") {
          retard = entree.arrival.delay;
        } else if (entree.departure && typeof entree.departure.delay === "number") {
          retard = entree.departure.delay;
        }
      }

      const tripId = v.trip ? v.trip.tripId : null;
      const destination = tripId ? destinationsParTrip[tripId] || null : null;

      // Horodatage de la position (VehiclePosition.timestamp) : permet au client
      // de repérer un « bus fantôme » dont la position n'a pas bougé depuis
      // plusieurs minutes — flux figé, on n'attend pas ce bus pour rien.
      const horodatage = v.timestamp ? Number(v.timestamp) : null;

      vehicules.push({
        id: vid,
        label: (v.vehicle && v.vehicle.label) || vid,
        ligne: v.trip ? v.trip.routeId : null,
        direction: v.trip ? v.trip.directionId : null,
        destination: destination,
        lat: p.latitude,
        lon: p.longitude,
        cap: typeof p.bearing === "number" ? Math.round(p.bearing) : null,
        vitesse: p.speed ? Math.round(p.speed * 3.6 * 10) / 10 : 0,
        prochain_arret: prochainArret,
        retard: retard,
        prochains_arrets: prochainsArrets,
        horodatage: horodatage,
      });
    });

    const alertes = extraireAlertes(feed, arrets);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        generated_at: new Date().toLocaleTimeString("fr-FR", {
          timeZone: "Europe/Paris",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        vehicules: vehicules,
        lignes: lignes,
        alertes: alertes,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ erreur: String(e && e.message ? e.message : e) }),
    };
  }
};

// Exposés pour les tests unitaires.
exports.extraireAlertes = extraireAlertes;
exports.texteTraduit = texteTraduit;
