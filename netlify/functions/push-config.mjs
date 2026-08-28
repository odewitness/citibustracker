import { CLE_PUBLIQUE, pushConfigure } from "./_lib/push.mjs";

// Indique au client si les notifications serveur sont disponibles sur ce
// déploiement, et lui donne la clé publique VAPID nécessaire à l'abonnement.
export default async function () {
  return Response.json(
    { disponible: pushConfigure, cle_publique: pushConfigure ? CLE_PUBLIQUE : null },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
