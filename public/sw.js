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

// --- Notifications push (alerte à l'approche) ---
// Envoyées par la fonction planifiée verifier-alertes : c'est ce qui permet à
// l'alerte de sonner alors que l'application est fermée ou l'écran verrouillé.
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

// Un tap sur la notification ramène sur l'application plutôt que d'ouvrir un
// second onglet si elle est déjà lancée.
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
