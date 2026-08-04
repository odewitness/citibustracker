// Service worker minimal : ne fait AUCUNE mise en cache et n'intercepte AUCUNE
// requête. Il sert uniquement à satisfaire le critère d'installabilité
// d'Android/Chrome (présence d'un service worker actif), sans risque.
//
// Important : on n'ajoute PAS de gestionnaire "fetch" qui rejouerait
// event.request via fetch() — repasser une requête de type "navigate" (le
// chargement de la page elle-même) dans fetch() est interdit par le
// navigateur et provoque un échec réseau silencieux → écran blanc.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
