// Abonnement aux notifications push. Tout est optionnel : si le déploiement n'a
// pas de clés VAPID, ou si le navigateur ne sait pas faire, l'application
// retombe silencieusement sur l'alerte locale (page ouverte).

const URL_CONFIG = "/.netlify/functions/push-config";
const URL_ABONNEMENT = "/.netlify/functions/push-abonnement";

// La clé VAPID est transmise en base64url ; l'API Push attend des octets bruts.
function versOctets(base64url) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binaire = atob(base64);
  return Uint8Array.from(binaire, (c) => c.charCodeAt(0));
}

export function pushPossible() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function lireClePush() {
  if (!pushPossible()) return null;
  try {
    const reponse = await fetch(URL_CONFIG);
    const donnees = await reponse.json();
    return donnees.disponible ? donnees.cle_publique : null;
  } catch (e) {
    return null;
  }
}

async function obtenirAbonnement(clePublique) {
  const enregistrement = await navigator.serviceWorker.ready;
  const existant = await enregistrement.pushManager.getSubscription();
  if (existant) {
    // Un abonnement créé avec une autre clé serveur ne peut pas être réutilisé.
    const memeCle =
      existant.options?.applicationServerKey &&
      new Uint8Array(existant.options.applicationServerKey).toString() ===
        versOctets(clePublique).toString();
    if (memeCle) return existant;
    await existant.unsubscribe();
  }
  return enregistrement.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: versOctets(clePublique),
  });
}

// Renvoie true si le serveur surveillera l'alerte à notre place.
export async function abonnerAlerte(clePublique, alerte) {
  if (!clePublique || !pushPossible()) return false;
  try {
    if (Notification.permission !== "granted") {
      const reponse = await Notification.requestPermission();
      if (reponse !== "granted") return false;
    }
    const abonnement = await obtenirAbonnement(clePublique);
    const envoi = await fetch(URL_ABONNEMENT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ abonnement, alerte }),
    });
    return envoi.ok;
  } catch (e) {
    return false;
  }
}

export async function annulerAlerteServeur() {
  if (!pushPossible()) return;
  try {
    const enregistrement = await navigator.serviceWorker.getRegistration();
    const abonnement = await enregistrement?.pushManager.getSubscription();
    if (!abonnement) return;
    await fetch(URL_ABONNEMENT, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ abonnement }),
    });
  } catch (e) {
    /* le serveur nettoiera de lui-même à l'expiration */
  }
}
