// Service worker : installabilité + notifications push + un cache prudent.
//
// Règle de survie (déjà apprise à nos dépens) : on n'intercepte JAMAIS les
// requêtes de navigation (chargement du document HTML). index.html est servi
// avec "no-store" par Netlify et doit toujours venir du réseau, sinon un
// téléphone peut rester bloqué sur une version qui référence des fichiers JS
// disparus après un déploiement → écran blanc. Le cache ci-dessous ne porte
// donc QUE sur des ressources au nom versionné (/assets/*) ou tierces
// immuables (polices, tuiles de carte, images Leaflet).

const CACHE = "citibus-v1";

// Préfixes sûrs à mettre en cache : contenu au nom unique par build, ou
// ressources externes stables.
const CACHEABLE = [
  "/assets/",
  "/icon-",
  "/apple-touch-icon",
  "https://fonts.googleapis.com/",
  "https://fonts.gstatic.com/",
  "https://tile.openstreetmap.org/",
  "https://a.tile.openstreetmap.org/",
  "https://b.tile.openstreetmap.org/",
  "https://c.tile.openstreetmap.org/",
];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge des anciennes versions de cache.
      const noms = await caches.keys();
      await Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

function estCacheable(url) {
  return CACHEABLE.some((prefixe) => url.startsWith(prefixe) || url.includes(prefixe));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // On ne touche à rien d'autre que les GET, et surtout PAS aux navigations.
  if (req.method !== "GET" || req.mode === "navigate") return;
  if (!estCacheable(req.url)) return;

  // Stale-while-revalidate : réponse immédiate depuis le cache si disponible,
  // rafraîchissement en arrière-plan. /assets/* étant immuable, le cache sert
  // de filet hors-ligne sans jamais servir un fichier périmé pour une autre URL.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const enCache = await cache.match(req);
      const reseau = fetch(req)
        .then((rep) => {
          if (rep && rep.status === 200) cache.put(req, rep.clone());
          return rep;
        })
        .catch(() => null);
      return enCache || (await reseau) || Response.error();
    })()
  );
});

// --- Notifications push (alerte à l'approche / descente) ---
self.addEventListener("push", (event) => {
  let donnees = {};
  try {
    donnees = event.data ? event.data.json() : {};
  } catch (e) {
    /* charge utile inattendue : on notifie quand même */
  }
  event.waitUntil(
    self.registration.showNotification(donnees.titre || "🚌 Bus proche !", {
      body: donnees.texte || "Ton bus approche.",
      tag: "citibus-alerte",
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      const existante = fenetres.find((f) => "focus" in f);
      if (existante) return existante.focus();
      return self.clients.openWindow("/");
    })
  );
});
