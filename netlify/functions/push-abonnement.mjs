import { cleAbonnement, magasinAlertes, pushConfigure } from "./_lib/push.mjs";

// Durée de vie d'une alerte enregistrée. Au-delà, on considère que l'utilisateur
// a oublié de la désarmer et on cesse de la surveiller.
const DUREE_MAX_HEURES = 6;

export default async function (req) {
  if (!pushConfigure) {
    return Response.json({ erreur: "Notifications serveur non configurées" }, { status: 501 });
  }

  let corps;
  try {
    corps = await req.json();
  } catch (e) {
    return Response.json({ erreur: "Requête illisible" }, { status: 400 });
  }

  const endpoint = corps?.abonnement?.endpoint;
  if (!endpoint) {
    return Response.json({ erreur: "Abonnement manquant" }, { status: 400 });
  }

  const cle = await cleAbonnement(endpoint);
  const magasin = magasinAlertes();

  if (req.method === "DELETE") {
    await magasin.delete(cle);
    return Response.json({ ok: true });
  }

  const alerte = corps.alerte;
  if (!alerte?.routeId || !alerte?.stopId) {
    return Response.json({ erreur: "Alerte incomplète" }, { status: 400 });
  }

  await magasin.setJSON(cle, {
    abonnement: corps.abonnement,
    alerte: {
      routeId: String(alerte.routeId),
      direction: String(alerte.direction ?? ""),
      stopId: String(alerte.stopId),
      nomArret: String(alerte.nomArret || ""),
      nomLigne: String(alerte.nomLigne || alerte.routeId),
      seuilMinutes: Number(alerte.seuilMinutes) || 5,
    },
    expireLe: Date.now() + DUREE_MAX_HEURES * 3600 * 1000,
  });

  return Response.json({ ok: true });
}
