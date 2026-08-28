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

  // Plusieurs alertes peuvent coexister pour un même navigateur : la clé de
  // stockage combine l'empreinte de l'abonnement et l'identifiant de l'alerte.
  const cleAlerte = (id) => (id ? `${cle}|${id}` : cle);

  if (req.method === "DELETE") {
    if (corps?.alerteId) {
      await magasin.delete(cleAlerte(String(corps.alerteId)));
    } else {
      // Sans identifiant : on retire toutes les alertes de cet abonnement.
      await magasin.delete(cle);
      const { blobs } = await magasin.list({ prefix: `${cle}|` });
      await Promise.all(blobs.map((b) => magasin.delete(b.key)));
    }
    return Response.json({ ok: true });
  }

  const alerte = corps.alerte;
  if (!alerte?.routeId || !alerte?.stopId) {
    return Response.json({ erreur: "Alerte incomplète" }, { status: 400 });
  }

  await magasin.setJSON(cleAlerte(alerte.id ? String(alerte.id) : ""), {
    abonnement: corps.abonnement,
    alerte: {
      id: alerte.id ? String(alerte.id) : "",
      type: alerte.type === "descente" ? "descente" : "approche",
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
