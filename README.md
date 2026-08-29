# Bus Citibus — Le Grand Narbonne

Suivi en temps réel des bus Citibus (Narbonne) : carte des véhicules, prochains
passages par arrêt, et alerte à l'approche. Application React + Vite déployée sur
Netlify, données issues des flux GTFS et GTFS-RT du réseau.

## Fonctionnalités

- **Tableau de bord** (écran d'accueil) : prochains départs des arrêts favoris
  (repli sur l'horaire théorique), arrêts proches avec temps de marche, infos
  trafic des lignes suivies, réarmement d'une alerte mémorisée. L'app rouvre sur
  le dernier écran quitté (tableau de bord ou carte) ; un lien profond ouvre
  directement la carte. Bouton ▦ dans la barre de statut pour y revenir.
- **Carte temps réel** : véhicules, tracés, arrêts cliquables. Les bus sont
  cerclés selon leur ponctualité (bleu en avance, vert à l'heure, ambre / rouge
  en retard). L'état de la position est nuancé : *récente*, *un peu ancienne*,
  *signal perdu* (figée alors qu'il reste des arrêts) ou *hors service* (course
  terminée). Un bandeau **hors-ligne** signale des données figées ; l'affichage
  se rafraîchit dès le retour de veille.
- **Fiche « trajet complet »** : toucher un bus ouvre sa frise d'arrêts à venir
  avec heure prévue, retard et temps restant arrêt par arrêt.
- **Affluence à bord** : niveau (peu de monde / bien rempli / bondé) et
  pourcentage quand le flux GTFS-RT les renseigne, sur la carte, la fiche du bus
  et les listes de passages.
- **Accessibilité UFR** : pictogramme ♿ sur les arrêts accessibles
  (`wheelchair_boarding`) et les courses accessibles (`wheelchair_accessible`).
- **Infos trafic** : bandeau dépliable alimenté par les Service Alerts du flux
  GTFS-RT (déviations, arrêts non desservis, lignes suspendues).
- **Arrêts** : recherche, tri par proximité (avec **temps de marche** estimé),
  prochains passages temps réel et **fiche horaire théorique** (calendrier GTFS)
  quand aucun bus ne circule, badge **« dernier passage »** de la journée.
- **Favoris** : arrêts et lignes épinglés ; les lignes favorites sont activées
  au démarrage.
- **Alertes** à l'approche *ou* de descente (« je suis à bord »), plusieurs
  alertes mémorisées, réarmement automatique récurrent (jours + heure).
  Signalement d'un **retard important** annoncé pendant le suivi. Le bandeau de
  suivi égrène un **compte à rebours vivant** (m:ss) entre deux relevés.
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

- `src/` — application React. `App.jsx` orchestre l'état (dont `ecran` :
  `"tableau"` ou `"carte"`, mémorisé), `CarteBus.jsx` gère Leaflet, les panneaux
  (`TableauDeBord`, `IleStatut`, `PanneauArrets`, `PanneauAlerte`,
  `PanneauFavoris`, `BandeauAlertes`, `BandeauSuivi`, `HorairesTheoriques`,
  `FicheBus`) sont purement présentationnels. La carte reste montée en fond ; le
  tableau de bord la recouvre. La sélection d'un bus est pilotée par `App`
  (`busSelectionneId`) et alimente `FicheBus`.
- `src/favoris.js` / `src/alertes.js` — état local partagé (favoris, alertes
  programmées) exposé via des hooks avec un mini-bus d'événements.
- `netlify/functions/bus-data.js` — flux temps réel, appelé toutes les 15 s.
  Renvoie aussi les alertes trafic (`extraireAlertes`), l'horodatage de chaque
  position, l'affluence à bord (`interpreterOccupation`) et l'accessibilité UFR
  de la course. N'utilise que le socle du GTFS statique (arrêts, lignes,
  destinations, drapeaux d'accessibilité).
- `netlify/functions/reseau-statique.js` — tracés et desserte des lignes.
  Quasi-statique, mis en cache 30 min côté navigateur.
- `netlify/functions/horaires-arret.js` — fiche horaire théorique d'un arrêt
  (`?arret=<stop_id>`), filtrée par le calendrier GTFS du jour. Marque le
  `dernier` passage de la journée d'exploitation par ligne + sens
  (`derniersPassages`) et renvoie l'accessibilité de l'arrêt et des courses.
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
