const protobuf = require("gtfs-realtime-bindings");
const AdmZip = require("adm-zip");

// Flux temps réel (positions des bus + horaires)
const FEED_URL = "https://feed-citibus-narbonne.ratpdev.com/GTFS-RT/gtfs-rt.bin";

// Données théoriques (GTFS statique) de Citibus : utilisées pour retrouver le
// nom des arrêts et des lignes à partir de leurs identifiants.
const GTFS_STATIQUE_URL =
  "https://s3.eu-west-1.amazonaws.com/files.orchestra.ratpdev.com/networks/narbonne/exports/scolaires-sans-tad.zip";

// Cache en mémoire : tant que la fonction reste "chaude" (conteneur réutilisé
// par Netlify entre deux appels rapprochés), on évite de retélécharger le
// zip GTFS statique à chaque requête. Si la fonction redémarre à froid, le
// cache est perdu et se reconstruit automatiquement au prochain appel.
let cacheStatique = null;

function splitCsvLine(line) {
  // Gestion simple des champs CSV, avec support des guillemets
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

async function chargerDonneesStatiques() {
  if (cacheStatique) return cacheStatique;

  const resp = await fetch(GTFS_STATIQUE_URL);
  if (!resp.ok) {
    throw new Error("Téléchargement GTFS statique échoué : " + resp.status);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  const zip = new AdmZip(buffer);

  const arrets = {};
  const lignes = {};

  const stopsEntry = zip.getEntry("stops.txt");
  if (stopsEntry) {
    parseCsv(stopsEntry.getData().toString("utf8")).forEach((row) => {
      arrets[row.stop_id] = row.stop_name || row.stop_id;
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

  // trips.txt associe chaque trip_id à une destination réelle (trip_headsign),
  // ex: "Gare SNCF" ou "Zone Plaisance" — c'est ce qu'affiche le bus lui-même.
  // On l'utilise pour remplacer "Sens 0 / Sens 1" par une vraie destination.
  const destinationsParTrip = {};
  const tripsEntry = zip.getEntry("trips.txt");
  if (tripsEntry) {
    parseCsv(tripsEntry.getData().toString("utf8")).forEach((row) => {
      if (row.trip_id && row.trip_headsign) {
        destinationsParTrip[row.trip_id] = row.trip_headsign;
      }
    });
  }

  cacheStatique = { arrets, lignes, destinationsParTrip };
  return cacheStatique;
}

exports.handler = async function () {
  try {
    const { arrets, lignes, destinationsParTrip } = await chargerDonneesStatiques();

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
      });
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        generated_at: new Date().toLocaleTimeString("fr-FR"),
        vehicules: vehicules,
        lignes: lignes,
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