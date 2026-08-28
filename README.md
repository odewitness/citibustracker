# Bus Citibus — Le Grand Narbonne

Suivi en temps réel des bus Citibus (Narbonne) : carte des véhicules, prochains
passages par arrêt, et alerte à l'approche. Application React + Vite déployée sur
Netlify, données issues des flux GTFS et GTFS-RT du réseau.

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
  Leaflet, les trois panneaux (`IleStatut`, `PanneauArrets`, `PanneauAlerte`)
  sont purement présentationnels.
- `netlify/functions/bus-data.js` — flux temps réel, appelé toutes les 15 s.
  N'utilise que le socle du GTFS statique (arrêts, lignes, destinations).
- `netlify/functions/reseau-statique.js` — tracés et desserte des lignes.
  Quasi-statique, mis en cache 30 min côté navigateur.
- `netlify/functions/_lib/gtfs-statique.js` — téléchargement et analyse de
  l'archive GTFS, en deux étages : `chargerBase()` (léger, pour le temps réel)
  et `chargerReseau()` (tracés et dessertes, plus lourd).

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
