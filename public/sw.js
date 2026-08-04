// Service worker minimal : ne fait aucune mise en cache, sert uniquement à
// satisfaire le critère d'installabilité d'Android/Chrome (qui exige un SW
// actif avec un gestionnaire "fetch" pour proposer le mode plein écran).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
