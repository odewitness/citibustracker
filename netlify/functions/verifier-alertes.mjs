import protobuf from "gtfs-realtime-bindings";
import { magasinAlertes, pushConfigure, webpush } from "./_lib/push.mjs";

const FEED_URL = "https://feed-citibus-narbonne.ratpdev.com/GTFS-RT/gtfs-rt.bin";

// Vérifie chaque minute les alertes enregistrées et envoie une notification
// push quand un bus approche. C'est ce qui permet à l'alerte de sonner
// téléphone verrouillé : le calcul ne dépend plus de la page ouverte.
export default async function () {
  if (!pushConfigure) return new Response("push non configuré", { status: 200 });

  const magasin = magasinAlertes();
  const { blobs } = await magasin.list();
  // Aucun abonné : inutile de télécharger le flux temps réel.
  if (blobs.length === 0) return new Response("aucune alerte", { status: 200 });

  const resp = await fetch(FEED_URL);
  if (!resp.ok) return new Response("flux indisponible : " + resp.status, { status: 200 });
  const feed = protobuf.transit_realtime.FeedMessage.decode(
    new Uint8Array(await resp.arrayBuffer())
  );

  const maintenant = Date.now();
  let envoyees = 0;

  for (const { key } of blobs) {
    const enregistrement = await magasin.get(key, { type: "json" });
    if (!enregistrement) continue;

    if (enregistrement.expireLe && enregistrement.expireLe < maintenant) {
      await magasin.delete(key);
      continue;
    }

    const { alerte, abonnement } = enregistrement;
    const eta = minutesAvantPassage(feed, alerte);
    if (eta === null || eta > alerte.seuilMinutes) continue;

    try {
      await webpush.sendNotification(
        abonnement,
        JSON.stringify({
          titre: "🚌 Bus proche !",
          texte: `Bus ligne ${alerte.nomLigne} à ${alerte.nomArret} dans ${Math.max(0, Math.round(eta))} min`,
        })
      );
      envoyees++;
    } catch (e) {
      // 404/410 = abonnement révoqué côté navigateur : on le nettoie.
      if (e?.statusCode !== 404 && e?.statusCode !== 410) {
        console.error("Envoi push échoué", e?.statusCode, e?.message);
      }
    }
    // Alerte à usage unique, comme côté client : une fois déclenchée, on oublie.
    await magasin.delete(key);
  }

  return new Response(`ok, ${envoyees} notification(s)`, { status: 200 });
}

// Plus petit délai d'arrivée, en minutes, parmi toutes les courses de la ligne
// et du sens visés qui desservent encore l'arrêt surveillé.
export function minutesAvantPassage(feed, alerte) {
  let meilleur = null;

  for (const entity of feed.entity) {
    const tu = entity.tripUpdate;
    if (!tu?.trip) continue;
    if (String(tu.trip.routeId) !== alerte.routeId) continue;
    if (alerte.direction !== "" && String(tu.trip.directionId ?? "") !== alerte.direction) continue;

    for (const s of tu.stopTimeUpdate || []) {
      if (s.stopId !== alerte.stopId) continue;
      const epoch = s.arrival?.time || s.departure?.time;
      if (!epoch) continue;
      const minutes = (Number(epoch) * 1000 - Date.now()) / 60000;
      if (minutes < -1) continue;
      if (meilleur === null || minutes < meilleur) meilleur = minutes;
    }
  }

  return meilleur;
}

export const config = { schedule: "* * * * *" };
