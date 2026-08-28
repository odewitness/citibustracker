# Bus Citibus — Le Grand Narbonne

Suivi en temps réel des bus Citibus (Narbonne) : carte des véhicules, prochains
passages par arrêt, et alerte à l'approche. Application React + Vite déployée sur
Netlify, données issues des flux GTFS et GTFS-RT du réseau.

## Fonctionnalités

- **Carte temps réel** : véhicules, tracés, arrêts cliquables. Les bus sont
  cerclés selon leur ponctualité (bleu en avance, vert à l'heure, ambre / rouge
  en retard) ; un bus dont la position est figée depuis plusieurs minutes est
  grisé et signalé (« bus fantôme »).
- **Infos trafic** : bandeau dépliable alimenté par les Service Alerts du flux
  GTFS-RT (déviations, arrêts non desservis, lignes suspendues).
- **Arrêts** : recherche, tri par proximité, prochains passages temps réel et
  **fiche horaire théorique** (calendrier GTFS) quand aucun bus ne circule.
- **Favoris** : arrêts et lignes épinglés ; les lignes favorites sont activées
  au démarrage.
- **Alertes** à l'approche *ou* de descente (« je suis à bord »), plusieurs
  alertes mémorisées, réarmement automatique récurrent (jours + heure).
- **Liens profonds / partage** : `?ligne=&sens=&arret=&action=` ouvre l'app
  préfiltrée ou le formulaire d'alerte prérempli ; boutons de partage natif.
- **PWA** installable avec raccourcis d'application et cache hors-ligne des
  ressources statiques (jamais du document HTML).

## Développement

```bash
npm install
npm run dev      # serveur de développement Vite
npm run lint     # ESLint (navigateur, Node et service worker)
npm test         # tests unitaires Vitest
npm run build    # build de production dans dist/
```

Le site de production se déploie automatiquement depuis la branche `main`.

## Architecture

- `src/` — application React. `App.jsx` orchestre l'état, `CarteBus.jsx` gère
  Leaflet, les panneaux (`IleStatut`, `PanneauArrets`, `PanneauAlerte`,
  `PanneauFavoris`, `BandeauAlertes`, `BandeauSuivi`, `HorairesTheoriques`) sont
  purement présentationnels.
- `src/favoris.js` / `src/alertes.js` — état local partagé (favoris, alertes
  programmées) exposé via des hooks avec un mini-bus d'événements.
- `netlify/functions/bus-data.js` — flux temps réel, appelé toutes les 15 s.
  Renvoie aussi les alertes trafic (`extraireAlertes`) et l'horodatage de chaque
  position. N'utilise que le socle du GTFS statique (arrêts, lignes, destinations).
- `netlify/functions/reseau-statique.js` — tracés et desserte des lignes.
  Quasi-statique, mis en cache 30 min côté navigateur.
- `netlify/functions/horaires-arret.js` — fiche horaire théorique d'un arrêt
  (`?arret=<stop_id>`), filtrée par le calendrier GTFS du jour.
- `netlify/functions/_lib/gtfs-statique.js` — téléchargement et analyse de
  l'archive GTFS, en trois étages : `chargerBase()` (léger, pour le temps réel),
  `chargerReseau()` (tracés et dessertes) et `chargerHoraires()` (heures de
  passage + calendrier, le plus lourd — réservé à `horaires-arret`).

## Notifications push (optionnel)

Sans configuration, l'alerte à l'approche fonctionne uniquement application
ouverte (l'écran est maintenu allumé pendant le suivi). Pour qu'elle sonne aussi
téléphone verrouillé, il faut activer les notifications serveur :

1. Générer une paire de clés VAPID :

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Dans Netlify → Site settings → Environment variables, définir :

   | Variable            | Valeur                                        |
   | ------------------- | --------------------------------------------- |
   | `VAPID_CLE_PUBLIQUE`| la clé publique générée                       |
   | `VAPID_CLE_PRIVEE`  | la clé privée générée (à ne pas committer)    |
   | `VAPID_CONTACT`     | `mailto:votre@adresse` (exigé par la norme)   |

3. Redéployer.

La fonction planifiée `verifier-alertes` s'exécute alors chaque minute, compare
les alertes enregistrées (stockées dans Netlify Blobs) au flux temps réel et
envoie la notification quand le bus approche. Tant que les clés sont absentes,
tout ce chemin reste inerte et l'application retombe sur l'alerte locale.

Plusieurs alertes peuvent être surveillées en parallèle par le serveur : la clé
de stockage combine l'empreinte de l'abonnement push et l'identifiant de
l'alerte (`type|ligne|sens|arrêt`). Le réarmement récurrent, lui, reste
côté client (horloge vérifiée toutes les 30 s tant que l'application est
ouverte).
