import webpush from "web-push";
import { getStore } from "@netlify/blobs";

// Les notifications côté serveur ne s'activent que si les clés VAPID sont
// présentes dans l'environnement Netlify. Sans elles, tout le chemin push est
// simplement inerte et l'application retombe sur l'alerte locale.
export const CLE_PUBLIQUE = process.env.VAPID_CLE_PUBLIQUE || "";
const CLE_PRIVEE = process.env.VAPID_CLE_PRIVEE || "";
const CONTACT = process.env.VAPID_CONTACT || "mailto:contact@example.org";

export const pushConfigure = Boolean(CLE_PUBLIQUE && CLE_PRIVEE);

if (pushConfigure) {
  webpush.setVapidDetails(CONTACT, CLE_PUBLIQUE, CLE_PRIVEE);
}

export function magasinAlertes() {
  return getStore({ name: "alertes-push", consistency: "strong" });
}

// Clé de stockage dérivée de l'endpoint : un même navigateur qui reprogramme
// une alerte écrase la précédente au lieu d'en accumuler.
export async function cleAbonnement(endpoint) {
  const octets = new TextEncoder().encode(endpoint);
  const empreinte = await crypto.subtle.digest("SHA-256", octets);
  return Array.from(new Uint8Array(empreinte))
    .map((o) => o.toString(16).padStart(2, "0"))
    .join("");
}

export { webpush };
