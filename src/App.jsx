import { useEffect, useMemo, useRef, useState } from "react";
import CarteBus from "./components/CarteBus.jsx";
import FicheBus from "./components/FicheBus.jsx";
import IleStatut from "./components/IleStatut.jsx";
import PanneauAlerte from "./components/PanneauAlerte.jsx";
import BandeauSuivi from "./components/BandeauSuivi.jsx";
import BandeauAlertes from "./components/BandeauAlertes.jsx";
import PanneauArrets from "./components/PanneauArrets.jsx";
import PanneauFavoris from "./components/PanneauFavoris.jsx";
import PanneauLigne from "./components/PanneauLigne.jsx";
import TableauDeBord from "./components/TableauDeBord.jsx";
import { abonnerAlerte, annulerAlerteServeur, lireClePush } from "./push.js";
import { useFavoris } from "./favoris.js";
import {
  useAlertesProgrammees,
  idAlerte,
  alerteRecurrenteADeclencher,
  marquerRecurrenceDeclenchee,
} from "./alertes.js";
import {
  GROUPE_PRINCIPALES,
  GROUPE_AUTRES,
  estLignePrincipale,
  trierParOrdreAutorise,
  trierParNom,
  lireStockage,
  ecrireStockage,
  jouerSon,
  debloquerSon,
  busFantome,
  lireParametresUrl,
  construireLien,
  partagerLien,
} from "./utils.js";

const CLE_PREFERENCES = "citibus:preferences";
const CLE_ALERTE = "citibus:alerte";

// Paramètres de lien profond (?ligne=…&sens=…&arret=…&action=…), lus une seule
// fois au démarrage puis effacés de la barre d'adresse.
const PARAMS_URL = lireParametresUrl();
if (typeof window !== "undefined" && window.location.search) {
  window.history.replaceState(null, "", window.location.pathname);
}

export default function App() {
  const preferencesInitiales = lireStockage(CLE_PREFERENCES);
  const alerteInitiale = lireStockage(CLE_ALERTE);

  const [donnees, setDonnees] = useState({
    vehicules: [],
    lignes: {},
    alertes: [],
    generated_at: null,
  });
  const [reseau, setReseau] = useState({
    traces: {},
    arrets: {},
    arretsInfos: {},
    directions: {},
    arretsParDirection: {},
  });
  const [lignesInfo, setLignesInfo] = useState({});
  const [lignesActives, setLignesActives] = useState(
    new Set(preferencesInitiales?.lignesActives || [])
  );
  // Onglet courant : lignes du réseau urbain (1-4 + Citadines) ou toutes les autres.
  const [groupe, setGroupe] = useState(preferencesInitiales?.groupe || GROUPE_PRINCIPALES);
  // Pour l'onglet « autres », on mémorise les lignes MASQUÉES plutôt que les
  // lignes actives : la liste varie au fil de la journée (bus scolaires, renforts),
  // et une ligne qui apparaît doit être visible par défaut.
  const [autresMasquees, setAutresMasquees] = useState(
    new Set(preferencesInitiales?.autresMasquees || [])
  );
  const [direction, setDirection] = useState(preferencesInitiales?.direction || "tous");
  const [erreur, setErreur] = useState(null);
  const [messageFlash, setMessageFlash] = useState("");
  const [horsLigne, setHorsLigne] = useState(
    typeof navigator !== "undefined" && navigator.onLine === false
  );

  const lignesInitialiseesRef = useRef(false);
  const mapApiRef = useRef(null);

  // Bus dont la fiche « trajet complet » est ouverte (sélection sur la carte).
  const [busSelectionneId, setBusSelectionneId] = useState(null);
  // Miroir pour la boucle de polling (closure du premier rendu).
  const busSelectionneIdRef = useRef(busSelectionneId);
  useEffect(() => {
    busSelectionneIdRef.current = busSelectionneId;
  }, [busSelectionneId]);

  // Suivi caméra : bus qu'un appui long a verrouillé au centre de l'écran, et
  // indicateur « l'utilisateur a repris la main » (zoom / panoramique) qui fait
  // apparaître le bouton « Recentrer ».
  const [busVerrouilleId, setBusVerrouilleId] = useState(null);
  const [suiviDecale, setSuiviDecale] = useState(false);
  const busVerrouilleIdRef = useRef(busVerrouilleId);
  useEffect(() => {
    busVerrouilleIdRef.current = busVerrouilleId;
  }, [busVerrouilleId]);

  // Fiche « ligne en direct » : { routeId, sens } ou null.
  const [ligneDetail, setLigneDetail] = useState(null);

  // Écran affiché : tableau de bord (accueil) ou carte plein écran. On rouvre
  // sur le dernier écran quitté ; un lien profond force la carte pour montrer
  // directement la ligne, l'arrêt ou le formulaire d'alerte ciblés.
  const [ecran, setEcran] = useState(() => {
    if (PARAMS_URL.ligne || PARAMS_URL.arret || PARAMS_URL.action) return "carte";
    return preferencesInitiales?.ecran === "carte" ? "carte" : "tableau";
  });

  // --- Favoris & alertes programmées ---
  const { favoris } = useFavoris();
  const favorisRef = useRef(favoris);
  useEffect(() => {
    favorisRef.current = favoris;
  }, [favoris]);
  const favorisAppliquesRef = useRef(false);
  const {
    liste: alertesProgrammees,
    enregistrer: enregistrerAlerte,
    supprimer: supprimerAlerteProgrammee,
    definirRecurrence,
  } = useAlertesProgrammees();
  const alertesProgrammeesRef = useRef(alertesProgrammees);
  useEffect(() => {
    alertesProgrammeesRef.current = alertesProgrammees;
  }, [alertesProgrammees]);

  const [panneauFavorisOuvert, setPanneauFavorisOuvert] = useState(PARAMS_URL.action === "favoris");
  const [arretCible, setArretCible] = useState(
    PARAMS_URL.arret && PARAMS_URL.action !== "alerte" ? PARAMS_URL.arret : null
  );

  // --- Alerte à l'approche / descente ---
  const [panneauOuvert, setPanneauOuvert] = useState(PARAMS_URL.action === "alerte");
  const [modeAlerte, setModeAlerte] = useState(alerteInitiale?.type || "approche");
  const [alerte, setAlerte] = useState(alerteInitiale); // {type, routeId, direction, stopId, nomArret, seuilMinutes, id}
  const [alerteArmee, setAlerteArmee] = useState(false);
  const [ligneFormAlerte, setLigneFormAlerte] = useState(alerteInitiale?.routeId || "");
  const [directionFormAlerte, setDirectionFormAlerte] = useState(alerteInitiale?.direction ?? "");
  const [arretFormAlerte, setArretFormAlerte] = useState(alerteInitiale?.stopId || "");
  const [seuilFormAlerte, setSeuilFormAlerte] = useState(alerteInitiale?.seuilMinutes || 5);
  // Clé VAPID du déploiement : non nulle = le serveur peut surveiller l'alerte
  // et notifier même application fermée.
  const [clePush, setClePush] = useState(null);
  const [alerteServeurActive, setAlerteServeurActive] = useState(false);

  // État structuré du suivi affiché dans la carte du bas (plutôt qu'une simple chaîne,
  // pour pouvoir afficher séparément horaire prévu / retard / temps restant)
  const [suivi, setSuivi] = useState(null);
  // formes possibles : { statut: 'recherche' | 'attente', texte } ou
  // { statut: 'suivi', ligneNom, arretNom, horairePrevu, retard, eta } ou
  // { statut: 'imminent', texte }

  // Miroirs en ref pour éviter les fermetures obsolètes dans le polling
  const alerteRef = useRef(alerte);
  const alerteArmeeRef = useRef(alerteArmee);
  const derniereCleDeclencheeRef = useRef(null);
  // Idem pour les noms de lignes : verifierAlerte() est appelée depuis la boucle
  // de polling, dont la closure date du premier rendu — sans ce miroir, elle lit
  // un lignesInfo vide et affiche l'identifiant GTFS brut à la place du numéro.
  const lignesInfoRef = useRef(lignesInfo);
  const minuteurDesarmementRef = useRef(null);
  // Clé du passage pour lequel un retard important a déjà été signalé, pour ne
  // pas répéter le message à chaque relevé.
  const retardAvertiRef = useRef(null);
  useEffect(() => { alerteRef.current = alerte; }, [alerte]);
  useEffect(() => { alerteArmeeRef.current = alerteArmee; }, [alerteArmee]);
  useEffect(() => { lignesInfoRef.current = lignesInfo; }, [lignesInfo]);

  function afficherMessage(texte) {
    setMessageFlash(texte);
    clearTimeout(afficherMessage._t);
    afficherMessage._t = setTimeout(() => setMessageFlash(""), 2600);
  }

  function nomLigne(routeId) {
    return lignesInfoRef.current[routeId]?.nom || routeId || "?";
  }

  // --- Récupération des données (toutes les 15s) ---
  useEffect(() => {
    let minuteur = null;

    async function recuperer() {
      try {
        const r = await fetch("/.netlify/functions/bus-data");
        const data = await r.json();
        if (data.erreur) {
          setErreur(data.erreur);
          return;
        }
        setErreur(null);
        setDonnees(data);

        // Le bus dont la fiche est ouverte a disparu du flux (course terminée,
        // signal perdu durablement) : on referme la fiche en l'expliquant plutôt
        // que de la voir s'évanouir sans un mot.
        const selId = busSelectionneIdRef.current;
        if (
          selId &&
          Array.isArray(data.vehicules) &&
          data.vehicules.length > 0 &&
          !data.vehicules.some((v) => v.id === selId)
        ) {
          setBusSelectionneId(null);
          afficherMessage("Ce bus a terminé sa course");
        }

        // Idem pour le bus suivi par la caméra : on relâche le verrou plutôt que
        // de voir la carte figée sur une position périmée.
        const verrId = busVerrouilleIdRef.current;
        if (
          verrId &&
          Array.isArray(data.vehicules) &&
          data.vehicules.length > 0 &&
          !data.vehicules.some((v) => v.id === verrId)
        ) {
          setBusVerrouilleId(null);
          setSuiviDecale(false);
          if (verrId !== selId) afficherMessage("Le bus suivi a terminé sa course");
        }

        if (!lignesInitialiseesRef.current && data.lignes) {
          // On conserve TOUTES les lignes du réseau : le filtrage se fait
          // désormais par onglet, pas à la source.
          setLignesInfo(data.lignes);
          if (!preferencesInitiales) {
            setLignesActives(
              new Set(
                Object.keys(data.lignes).filter((routeId) =>
                  estLignePrincipale(data.lignes[routeId])
                )
              )
            );
          }
          lignesInitialiseesRef.current = true;
        }

        verifierAlerte(data);
      } catch (e) {
        setErreur("Connexion perdue");
      }
    }
    function demarrer() {
      if (minuteur) return;
      recuperer();
      minuteur = setInterval(recuperer, 15000);
    }
    function arreter() {
      clearInterval(minuteur);
      minuteur = null;
    }

    // Inutile d'interroger le serveur toutes les 15 s quand l'app est en
    // arrière-plan ou l'écran éteint : c'est de la batterie et des données
    // mobiles pour un écran que personne ne regarde. On garde le polling
    // uniquement si une alerte est armée (le suivi doit rester à jour).
    function surChangementVisibilite() {
      if (document.visibilityState === "visible") {
        // Rafraîchissement immédiat : au retour de veille, l'affichage peut
        // dater de plusieurs minutes (le suivi d'alerte gardait le minuteur en
        // vie, donc demarrer() seul n'aurait rien relancé).
        recuperer();
        demarrer();
      } else if (!alerteArmeeRef.current) {
        arreter();
      }
    }

    demarrer();
    document.addEventListener("visibilitychange", surChangementVisibilite);
    return () => {
      arreter();
      document.removeEventListener("visibilitychange", surChangementVisibilite);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    lireClePush().then(setClePush);
  }, []);

  // Débloque l'AudioContext au premier geste : sur iOS/Safari, une alerte
  // réarmée automatiquement ne pourrait pas sonner sinon (aucune interaction
  // au moment du déclenchement).
  useEffect(() => {
    const reveiller = () => debloquerSon();
    window.addEventListener("pointerdown", reveiller, { once: true });
    window.addEventListener("keydown", reveiller, { once: true });
    return () => {
      window.removeEventListener("pointerdown", reveiller);
      window.removeEventListener("keydown", reveiller);
    };
  }, []);

  // Connexion : distinguer « hors ligne » (données figées, on le dit calmement)
  // d'une vraie erreur serveur.
  useEffect(() => {
    const majEtat = () => setHorsLigne(navigator.onLine === false);
    window.addEventListener("online", majEtat);
    window.addEventListener("offline", majEtat);
    return () => {
      window.removeEventListener("online", majEtat);
      window.removeEventListener("offline", majEtat);
    };
  }, []);


  // Données réseau (tracés + arrêts) : quasi-statiques, récupérées une seule fois
  // au démarrage plutôt qu'à chaque poll de 15s.
  useEffect(() => {
    fetch("/.netlify/functions/reseau-statique")
      .then((r) => r.json())
      .then((data) => {
        if (data.erreur) return;
        setReseau({
          traces: data.traces || {},
          arrets: data.arrets || {},
          arretsInfos: data.arrets_infos || {},
          directions: data.directions || {},
          arretsParDirection: data.arrets_par_direction || {},
        });
        // Lien profond ?arret=… : on recadre la carte sur l'arrêt visé dès que
        // ses coordonnées sont connues.
        const cible = PARAMS_URL.arret && data.arrets_infos?.[PARAMS_URL.arret];
        if (cible) mapApiRef.current?.centrerSur(cible.lat, cible.lon, 16);
      })
      .catch(() => {
        /* pas grave : la carte fonctionne sans le tracé/les arrêts */
      });
  }, []);

  useEffect(() => {
    ecrireStockage(CLE_PREFERENCES, {
      lignesActives: Array.from(lignesActives),
      autresMasquees: Array.from(autresMasquees),
      groupe,
      direction,
      ecran,
    });
  }, [lignesActives, autresMasquees, groupe, direction, ecran]);

  // Une fois les lignes connues : on active les lignes favorites (elles doivent
  // apparaître d'emblée sur la carte) et on applique le filtre d'un éventuel
  // lien profond ?ligne=…&sens=…
  useEffect(() => {
    if (favorisAppliquesRef.current) return;
    if (Object.keys(lignesInfo).length === 0) return;
    favorisAppliquesRef.current = true;

    const aAjouter = favorisRef.current.lignes.filter((id) => lignesInfo[id]);
    if (PARAMS_URL.ligne && lignesInfo[PARAMS_URL.ligne]) aAjouter.push(PARAMS_URL.ligne);

    if (aAjouter.length > 0) {
      setLignesActives((prec) => {
        const suivant = new Set(prec);
        aAjouter.forEach((id) => suivant.add(id));
        return suivant;
      });
      // Un lien vers une ligne « autre » doit basculer sur le bon onglet.
      if (PARAMS_URL.ligne && !estLignePrincipale(lignesInfo[PARAMS_URL.ligne])) {
        setGroupe(GROUPE_AUTRES);
      }
    }
    if (PARAMS_URL.sens === "0" || PARAMS_URL.sens === "1") setDirection(PARAMS_URL.sens);
  }, [lignesInfo]);

  // Lien profond ?ligne=…&vue=ligne : ouvre la fiche « ligne en direct » dès que
  // les lignes sont connues.
  const vueLigneAppliqueeRef = useRef(false);
  useEffect(() => {
    if (vueLigneAppliqueeRef.current) return;
    if (PARAMS_URL.vue !== "ligne" || !PARAMS_URL.ligne) return;
    if (!lignesInfo[PARAMS_URL.ligne]) return;
    vueLigneAppliqueeRef.current = true;
    ouvrirPanneauLigne(PARAMS_URL.ligne, PARAMS_URL.sens || "tous");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignesInfo]);

  // Lien profond ?action=alerte&arret=… : préremplit le formulaire d'alerte une
  // fois la desserte théorique connue.
  const lienAlerteAppliqueRef = useRef(false);
  useEffect(() => {
    if (lienAlerteAppliqueRef.current) return;
    if (PARAMS_URL.action !== "alerte" || !PARAMS_URL.arret) return;
    if (Object.keys(reseau.arretsParDirection).length === 0) return;
    lienAlerteAppliqueRef.current = true;
    creerAlertePourArret(PARAMS_URL.arret);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reseau.arretsParDirection]);

  // --- Répartition des lignes entre les deux onglets ---
  const idsPrincipales = useMemo(
    () => trierParOrdreAutorise(
      Object.keys(lignesInfo).filter((id) => estLignePrincipale(lignesInfo[id])),
      lignesInfo
    ),
    [lignesInfo]
  );

  // Onglet « autres bus » : toutes les lignes hors réseau urbain qui ont au moins
  // un véhicule dans le flux temps réel — inutile de lister les centaines de
  // lignes scolaires du GTFS qui ne circulent pas à cette heure-ci.
  // Dépend d'une clé textuelle stable et non du tableau de véhicules, qui est
  // remplacé à chaque relevé : sans cela, la liste (donc l'ensemble des lignes
  // actives) changeait d'identité toutes les 15 s et faisait redessiner tout le
  // réseau — tracés et arrêts compris — sans qu'aucune ligne n'ait bougé.
  const cleLignesEnCirculation = useMemo(
    () => Array.from(new Set(donnees.vehicules.map((v) => String(v.ligne)))).sort().join(","),
    [donnees.vehicules]
  );

  const idsAutres = useMemo(() => {
    const enCirculation = new Set(cleLignesEnCirculation.split(","));
    return trierParNom(
      Object.keys(lignesInfo).filter(
        (id) => !estLignePrincipale(lignesInfo[id]) && enCirculation.has(id)
      ),
      lignesInfo
    );
  }, [lignesInfo, cleLignesEnCirculation]);

  const idsCourants = groupe === GROUPE_AUTRES ? idsAutres : idsPrincipales;

  // Le panneau d'alerte, lui, propose toutes les lignes des deux onglets.
  const idsAlerte = useMemo(() => [...idsPrincipales, ...idsAutres], [idsPrincipales, idsAutres]);

  // Lignes ayant au moins un véhicule dans le flux : sélecteur de la fiche
  // « ligne en direct ».
  const idsLignesEnDirect = useMemo(
    () =>
      trierParNom(
        cleLignesEnCirculation.split(",").filter((id) => id && lignesInfo[id]),
        lignesInfo
      ),
    [cleLignesEnCirculation, lignesInfo]
  );

  // Lignes réellement affichées sur la carte : celles de l'onglet courant qui
  // ne sont pas désactivées.
  const lignesActivesCourantes = useMemo(
    () =>
      groupe === GROUPE_AUTRES
        ? new Set(idsAutres.filter((id) => !autresMasquees.has(id)))
        : lignesActives,
    [groupe, idsAutres, autresMasquees, lignesActives]
  );

  function basculerLigne(routeId) {
    if (groupe === GROUPE_AUTRES) {
      setAutresMasquees((prec) => {
        const suivant = new Set(prec);
        if (suivant.has(routeId)) suivant.delete(routeId);
        else suivant.add(routeId);
        return suivant;
      });
      return;
    }
    setLignesActives((prec) => {
      const suivant = new Set(prec);
      if (suivant.has(routeId)) suivant.delete(routeId);
      else suivant.add(routeId);
      return suivant;
    });
  }

  function toutAfficher() {
    if (groupe === GROUPE_AUTRES) setAutresMasquees(new Set());
    else setLignesActives(new Set(idsPrincipales));
  }

  function toutMasquer() {
    if (groupe === GROUPE_AUTRES) setAutresMasquees(new Set(idsAutres));
    else setLignesActives(new Set());
  }

  // --- Position de l'utilisateur ---
  // Mémorisée (et pas seulement utilisée pour recentrer la carte) : c'est elle
  // qui permet de classer les arrêts par proximité dans le panneau des arrêts.
  const [recentrageEnCours, setRecentrageEnCours] = useState(false);
  const [positionUtilisateur, setPositionUtilisateur] = useState(null);

  function localiser({ recentrer }) {
    if (!navigator.geolocation) {
      afficherMessage("Géolocalisation non supportée par ce navigateur");
      return;
    }
    setRecentrageEnCours(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRecentrageEnCours(false);
        const position = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setPositionUtilisateur(position);
        mapApiRef.current?.afficherPositionUtilisateur(position.lat, position.lon);
        if (recentrer) mapApiRef.current?.centrerSur(position.lat, position.lon, 16);
      },
      () => {
        setRecentrageEnCours(false);
        afficherMessage("Position indisponible — vérifie l'autorisation de localisation");
      },
      // maximumAge : réutilise un point GPS de moins de 30 s plutôt que de
      // relancer une acquisition complète à chaque ouverture d'un panneau.
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }

  const recentrerSurMoi = () => localiser({ recentrer: true });

  // --- Panneau des arrêts (proximité + recherche) ---
  const [panneauArretsOuvert, setPanneauArretsOuvert] = useState(
    PARAMS_URL.action === "arrets" ||
      (Boolean(PARAMS_URL.arret) &&
        PARAMS_URL.action !== "alerte" &&
        PARAMS_URL.action !== "favoris")
  );

  function ouvrirPanneauArrets() {
    setPanneauOuvert(false);
    setPanneauFavorisOuvert(false);
    setPanneauArretsOuvert(true);
    // Sans position connue, la liste ne peut être triée que par nom : on tente
    // la localisation dès l'ouverture plutôt que d'attendre un second geste.
    if (!positionUtilisateur) localiser({ recentrer: false });
  }

  function ouvrirPanneauFavoris() {
    setPanneauOuvert(false);
    setPanneauArretsOuvert(false);
    setPanneauFavorisOuvert(true);
  }

  // Ouvre la fiche « ligne en direct ». Sans routeId (bouton générique de l'île
  // de statut), on prend la première ligne active qui roule, sinon la première
  // ligne en circulation.
  function ouvrirPanneauLigne(routeId, sens = "tous") {
    let cible = routeId && lignesInfo[routeId] ? routeId : null;
    if (!cible) {
      cible =
        [...lignesActivesCourantes].find((id) => idsLignesEnDirect.includes(id)) ||
        idsLignesEnDirect[0] ||
        null;
    }
    if (!cible) {
      afficherMessage("Aucune ligne en circulation pour le moment");
      return;
    }
    setPanneauOuvert(false);
    setPanneauArretsOuvert(false);
    setPanneauFavorisOuvert(false);
    setBusSelectionneId(null);
    setLigneDetail({ routeId: cible, sens });
  }

  // Depuis la fiche « ligne en direct » : rend la ligne visible sur la carte,
  // ferme la fiche et recadre sur ses véhicules.
  function afficherLigneSurCarte(routeId) {
    if (estLignePrincipale(lignesInfo[routeId])) {
      setGroupe(GROUPE_PRINCIPALES);
      setLignesActives((prec) => new Set(prec).add(routeId));
    } else {
      setGroupe(GROUPE_AUTRES);
      setAutresMasquees((prec) => {
        const suivant = new Set(prec);
        suivant.delete(routeId);
        return suivant;
      });
    }
    const points = donnees.vehicules
      .filter(
        (v) =>
          String(v.ligne) === String(routeId) &&
          Number.isFinite(v.lat) &&
          Number.isFinite(v.lon)
      )
      .map((v) => [v.lat, v.lon]);
    if (points.length > 0) mapApiRef.current?.ajusterSur(points);
    setLigneDetail(null);
  }

  // Ouvre la fiche d'un arrêt (depuis les favoris ou un lien) : recadre la carte
  // et affiche son détail dans le panneau des arrêts.
  function ouvrirFicheArret(arret) {
    setArretCible(arret.stopId);
    setPanneauFavorisOuvert(false);
    setPanneauOuvert(false);
    setPanneauArretsOuvert(true);
    if (Number.isFinite(arret.lat) && Number.isFinite(arret.lon)) {
      mapApiRef.current?.centrerSur(arret.lat, arret.lon, 16);
    }
  }

  // Prépare le formulaire d'alerte pour un arrêt donné en devinant une ligne et
  // un sens qui le desservent (d'après la desserte théorique).
  function creerAlertePourArret(stopId) {
    for (const cle of Object.keys(reseau.arretsParDirection)) {
      if ((reseau.arretsParDirection[cle] || []).includes(stopId)) {
        const sep = cle.lastIndexOf("|");
        setLigneFormAlerte(cle.slice(0, sep));
        setDirectionFormAlerte(cle.slice(sep + 1));
        setArretFormAlerte(stopId);
        break;
      }
    }
    setPanneauArretsOuvert(false);
    setPanneauFavorisOuvert(false);
    setArretCible(null);
    setPanneauOuvert(true);
  }

  // --- Alerte à l'approche : sens (destinations réelles) et arrêts disponibles ---
  // Les sens et les arrêts viennent des horaires théoriques (GTFS statique) et
  // non des bus en circulation : sinon le panneau est vide dès qu'aucun bus ne
  // roule — tôt le matin, le soir, le dimanche — c'est-à-dire précisément quand
  // on veut programmer une alerte. Le temps réel ne sert qu'à préciser la
  // destination affichée.
  function directionsDisponiblesPour(routeId) {
    const libellesTempsReel = new Map();
    donnees.vehicules.forEach((v) => {
      if (String(v.ligne) !== String(routeId) || !v.destination) return;
      libellesTempsReel.set(String(v.direction), v.destination);
    });

    const theoriques = reseau.directions[routeId] || [];
    if (theoriques.length > 0) {
      return theoriques.map(([dir, libelle]) => [dir, libellesTempsReel.get(dir) || libelle]);
    }

    // Repli si le réseau théorique n'est pas (encore) chargé
    const dispo = new Map();
    donnees.vehicules.forEach((v) => {
      if (String(v.ligne) !== String(routeId)) return;
      const dir = String(v.direction);
      if (!dispo.has(dir) || (!dispo.get(dir) && v.destination)) {
        dispo.set(dir, v.destination || "Sens " + dir);
      }
    });
    return Array.from(dispo.entries()); // [[direction, libellé], ...]
  }

  function arretsDisponiblesPour(routeId, dir) {
    // Desserte de référence, dans l'ordre du trajet
    const idsTheoriques = reseau.arretsParDirection[routeId + "|" + dir] || [];
    if (idsTheoriques.length > 0) {
      return idsTheoriques.map((stopId) => [stopId, reseau.arretsInfos[stopId]?.nom || stopId]);
    }

    const dispo = new Map();
    donnees.vehicules.forEach((v) => {
      if (String(v.ligne) !== String(routeId)) return;
      if (dir && String(v.direction) !== String(dir)) return;
      (v.prochains_arrets || []).forEach((a) => {
        if (a.stop_id) dispo.set(a.stop_id, a.nom);
      });
    });
    return Array.from(dispo.entries());
  }

  // Ouvre le panneau en garantissant toujours une ligne/direction valides
  // (c'est l'absence de cette garantie qui provoquait l'affichage "Ligne undefined")
  function ouvrirPanneauAlerte() {
    const idsDisponibles = idsAlerte;
    let ligne = alerte?.routeId || ligneFormAlerte;
    if (!ligne || !lignesInfo[ligne]) ligne = idsDisponibles[0] || "";

    const dirsDispo = directionsDisponiblesPour(ligne);
    let dir = alerte && alerte.routeId === ligne ? alerte.direction : directionFormAlerte;
    if (!dirsDispo.some(([d]) => d === String(dir))) dir = dirsDispo[0]?.[0] ?? "";

    const arretsDispo = arretsDisponiblesPour(ligne, dir);
    let arret = alerte && alerte.routeId === ligne && alerte.direction === dir ? alerte.stopId : arretFormAlerte;
    if (!arretsDispo.some(([id]) => id === arret)) arret = "";

    setLigneFormAlerte(ligne);
    setDirectionFormAlerte(dir);
    setArretFormAlerte(arret);
    if (alerte) {
      setSeuilFormAlerte(alerte.seuilMinutes);
      setModeAlerte(alerte.type || "approche");
    }
    setPanneauArretsOuvert(false);
    setPanneauFavorisOuvert(false);
    setPanneauOuvert(true);
  }

  // Changement de type d'alerte : les seuils proposés diffèrent (min. avant
  // passage vs min. avant l'arrivée), on ramène le seuil dans le bon jeu.
  function changerModeAlerte(mode) {
    setModeAlerte(mode);
    const seuilsValides = mode === "descente" ? [1, 2, 3] : [2, 5, 10];
    if (!seuilsValides.includes(seuilFormAlerte)) {
      setSeuilFormAlerte(mode === "descente" ? 2 : 5);
    }
  }

  // Arme une alerte à partir d'une configuration complète. Point de passage
  // commun au formulaire, aux alertes mémorisées et au réarmement automatique.
  function armerAlerte(config, { silencieux = false } = {}) {
    const type = config.type === "descente" ? "descente" : "approche";
    const nouvelleAlerte = {
      id: config.id || idAlerte({ ...config, type }),
      type,
      routeId: config.routeId,
      direction: String(config.direction ?? ""),
      stopId: config.stopId,
      nomArret: config.nomArret || "",
      seuilMinutes: config.seuilMinutes || (type === "descente" ? 2 : 5),
    };
    setAlerte(nouvelleAlerte);
    setModeAlerte(type);
    ecrireStockage(CLE_ALERTE, nouvelleAlerte);
    setAlerteArmee(true);
    derniereCleDeclencheeRef.current = null;
    retardAvertiRef.current = null;
    setSuivi({ statut: "recherche", texte: "Recherche du prochain bus…" });
    setPanneauOuvert(false);
    // Le suivi vit sur la carte (bandeau + recentrage) : on y bascule.
    setEcran("carte");

    if (clePush) {
      abonnerAlerte(clePush, {
        ...nouvelleAlerte,
        nomLigne: nomLigne(nouvelleAlerte.routeId),
      }).then((ok) => {
        setAlerteServeurActive(ok);
        if (!silencieux) {
          afficherMessage(
            ok
              ? "Alerte activée — tu peux fermer l'application"
              : "Alerte activée — garde l'application ouverte"
          );
        }
      });
    } else {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
      if (!silencieux) afficherMessage("Alerte activée — garde l'application ouverte");
    }
  }

  // Construit une configuration d'alerte depuis l'état du formulaire.
  function configDepuisFormulaire() {
    const nomArret =
      arretsDisponiblesPour(ligneFormAlerte, directionFormAlerte).find(
        ([id]) => id === arretFormAlerte
      )?.[1] || "";
    return {
      type: modeAlerte,
      routeId: ligneFormAlerte,
      direction: directionFormAlerte,
      stopId: arretFormAlerte,
      nomArret,
      seuilMinutes: seuilFormAlerte,
    };
  }

  function activerAlerte() {
    if (!arretFormAlerte) {
      afficherMessage("Choisis un arrêt disponible");
      return;
    }
    armerAlerte(configDepuisFormulaire());
  }

  function enregistrerDepuisFormulaire() {
    if (!arretFormAlerte) {
      afficherMessage("Choisis un arrêt disponible");
      return;
    }
    const config = configDepuisFormulaire();
    enregistrerAlerte({ ...config, nomLigne: nomLigne(config.routeId) });
    afficherMessage("Alerte enregistrée dans « Mes alertes »");
  }

  function desarmerAlerte() {
    clearTimeout(minuteurDesarmementRef.current);
    minuteurDesarmementRef.current = null;
    setAlerteArmee(false);
    setAlerteServeurActive(false);
    setSuivi(null);
    annulerAlerteServeur(alerteRef.current?.id);
  }

  // Réarmement automatique des alertes récurrentes : on vérifie l'horloge toutes
  // les 30 s et on arme (en silence) la première alerte dont le créneau tombe.
  useEffect(() => {
    function verifier() {
      const a = alerteRecurrenteADeclencher(alertesProgrammeesRef.current);
      if (!a) return;
      if (alerteArmeeRef.current && alerteRef.current?.id === a.id) return;
      marquerRecurrenceDeclenchee(a.id);
      armerAlerte(a, { silencieux: true });
      afficherMessage(`Alerte « ${a.nomArret} » réarmée automatiquement`);
    }
    verifier();
    const minuteur = setInterval(verifier, 30000);
    return () => clearInterval(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function declencherAlerte(minutesRestantes, routeId, nomArret) {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    jouerSon();
    const minutes = Math.max(0, minutesRestantes);
    const descente = alerteRef.current?.type === "descente";
    const texte = descente
      ? `Ligne ${nomLigne(routeId)} : arrivée à ${nomArret} dans ${minutes} min`
      : `Bus ligne ${nomLigne(routeId)} à ${nomArret} dans ${minutes} min`;
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(descente ? "🚌 Prépare ta descente" : "🚌 Bus proche !", {
        body: texte,
        tag: "citibus-alerte",
      });
    }
    setSuivi({
      statut: "imminent",
      texte,
      ligneNom: nomLigne(routeId),
      arretNom: nomArret,
      eta: Math.max(0, minutesRestantes),
    });
    // Un seul minuteur à la fois : sans ce nettoyage, réarmer une alerte dans
    // les 90 s laissait l'ancien minuteur désarmer la nouvelle.
    clearTimeout(minuteurDesarmementRef.current);
    minuteurDesarmementRef.current = setTimeout(() => desarmerAlerte(), 90000);
  }

  // Tant qu'une alerte est armée, on demande au navigateur de garder l'écran
  // allumé : la boucle de suivi est gelée dès que la page passe en arrière-plan,
  // donc un téléphone verrouillé ne peut pas sonner. Le verrou est perdu à
  // chaque passage en arrière-plan, d'où la reprise sur visibilitychange.
  useEffect(() => {
    // Inutile quand le serveur surveille l'alerte : la notification arrivera
    // toute seule, autant laisser l'écran s'éteindre.
    if (!alerteArmee || alerteServeurActive || !("wakeLock" in navigator)) return;
    let annule = false;
    let verrou = null;

    async function demander() {
      try {
        const nouveau = await navigator.wakeLock.request("screen");
        if (annule) nouveau.release().catch(() => {});
        else verrou = nouveau;
      } catch (e) {
        /* refusé (batterie faible, onglet masqué…) : tant pis */
      }
    }
    function surVisibilite() {
      if (document.visibilityState === "visible") demander();
    }

    demander();
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      annule = true;
      document.removeEventListener("visibilitychange", surVisibilite);
      verrou?.release().catch(() => {});
    };
  }, [alerteArmee, alerteServeurActive]);

  // Recalcule l'état de l'alerte à chaque nouvelle donnée reçue
  function verifierAlerte(data) {
    const alerteActuelle = alerteRef.current;
    if (!alerteArmeeRef.current || !alerteActuelle) return;

    let meilleurBus = null;
    let meilleurEta = null;
    let meilleurArretInfo = null;

    (data.vehicules || []).forEach((v) => {
      if (String(v.ligne) !== String(alerteActuelle.routeId)) return;
      if (String(v.direction) !== String(alerteActuelle.direction)) return;
      // Un bus dont la position est figée depuis plusieurs minutes donnerait un
      // temps d'attente calculé sur des données périmées : on l'écarte du suivi.
      if (busFantome(v)) return;
      (v.prochains_arrets || []).forEach((a) => {
        if (a.stop_id !== alerteActuelle.stopId || !a.arrivee) return;
        const etaMinutes = (a.arrivee * 1000 - Date.now()) / 60000;
        if (etaMinutes < -1) return;
        if (meilleurEta === null || etaMinutes < meilleurEta) {
          meilleurEta = etaMinutes;
          meilleurBus = v;
          meilleurArretInfo = a;
        }
      });
    });

    if (!meilleurBus) {
      setSuivi((prec) =>
        prec && prec.statut === "imminent"
          ? prec
          : { statut: "attente", texte: `Aucun bus prévu pour le moment à ${alerteActuelle.nomArret}…` }
      );
      return;
    }

    const cleCePassage = `${alerteActuelle.routeId}|${alerteActuelle.direction}|${alerteActuelle.stopId}|${meilleurArretInfo.arrivee}`;
    const dejaDeclenchee = derniereCleDeclencheeRef.current === cleCePassage;

    if (!dejaDeclenchee) {
      mapApiRef.current?.suivre(meilleurBus.lat, meilleurBus.lon);
      setSuivi({
        statut: "suivi",
        ligneNom: nomLigne(alerteActuelle.routeId),
        arretNom: alerteActuelle.nomArret,
        horairePrevu: meilleurArretInfo.horaire_prevu,
        retard: meilleurArretInfo.retard,
        eta: Math.max(0, Math.round(meilleurEta)),
        // Heure d'arrivée absolue (epoch, s) : laisse le bandeau de suivi
        // égrener un compte à rebours vivant entre deux relevés de 15 s.
        arriveeEpoch: meilleurArretInfo.arrivee || null,
      });
    }

    // Perturbation à l'approche : si le bus suivi annonce un retard important,
    // on prévient une fois (le bandeau de suivi affiche déjà le détail).
    const retardSec = meilleurArretInfo.retard;
    if (retardSec !== null && retardSec !== undefined && retardSec > 300) {
      const cleRetard = cleCePassage + "|retard";
      if (retardAvertiRef.current !== cleRetard) {
        retardAvertiRef.current = cleRetard;
        afficherMessage(
          `Ligne ${nomLigne(alerteActuelle.routeId)} : +${Math.round(retardSec / 60)} min de retard annoncé`
        );
        if (navigator.vibrate) navigator.vibrate(120);
      }
    }

    if (meilleurEta <= alerteActuelle.seuilMinutes && !dejaDeclenchee) {
      derniereCleDeclencheeRef.current = cleCePassage;
      declencherAlerte(Math.round(meilleurEta), alerteActuelle.routeId, alerteActuelle.nomArret);
    }
  }

  // Boutons flottants empilés du bas vers le haut (0 = le plus bas). La carte de
  // suivi, quand elle est affichée, pousse toute la pile vers le haut.
  // Une feuille ouverte (arrêts ou alerte) recouvre le bas de l'écran : laisser
  // les boutons flottants dessous les rendait visibles mais intouchables.
  const busSuivi = busSelectionneId
    ? donnees.vehicules.find((v) => v.id === busSelectionneId) || null
    : null;

  // Appui long sur un bus → la carte le garde centré. Un second appui long sur
  // un autre bus déplace le verrou ; le bouton « Suivi » (ou un tap sur le fond
  // de carte) l'enlève.
  function verrouillerSuiviBus(id) {
    setBusVerrouilleId(id);
    setSuiviDecale(false);
    afficherMessage("Suivi activé — le bus reste centré à l'écran");
  }
  function arreterSuiviBus() {
    setBusVerrouilleId(null);
    setSuiviDecale(false);
  }

  const feuilleOuverte =
    panneauArretsOuvert ||
    panneauOuvert ||
    panneauFavorisOuvert ||
    Boolean(busSuivi) ||
    Boolean(ligneDetail);

  function hauteurBouton(rang) {
    return `calc(${(suivi ? 90 : 18) + rang * 60}px + env(safe-area-inset-bottom))`;
  }

  async function partagerAlerteCourante() {
    const lien = construireLien(window.location.origin + window.location.pathname, {
      ligne: ligneFormAlerte,
      sens: directionFormAlerte,
      arret: arretFormAlerte,
      action: "alerte",
    });
    const resultat = await partagerLien(lien, "Alerte bus Citibus");
    if (resultat === "copie") afficherMessage("Lien copié");
    else if (resultat === "echec") afficherMessage("Partage indisponible");
  }

  const nbVisibles = donnees.vehicules.filter(
    (b) =>
      lignesActivesCourantes.has(String(b.ligne)) &&
      (direction === "tous" || String(b.direction) === direction) &&
      lignesInfo[b.ligne]
  ).length;

  const statutTexte = horsLigne
    ? "Hors ligne — données figées"
    : erreur
      ? erreur
      : `${nbVisibles} bus${donnees.generated_at ? " • mis à jour à " + donnees.generated_at : ""}`;

  return (
    <div className="font-sans">
      <CarteBus
        vehicules={donnees.vehicules}
        lignesInfo={lignesInfo}
        lignesActives={lignesActivesCourantes}
        direction={direction}
        traces={reseau.traces}
        arretsParLigne={reseau.arrets}
        arretsInfos={reseau.arretsInfos}
        mapApiRef={mapApiRef}
        busSelectionneId={busSelectionneId}
        onChangerBusSelectionne={setBusSelectionneId}
        onOuvrirArret={(arret) => {
          setBusSelectionneId(null);
          ouvrirFicheArret(arret);
        }}
        busVerrouilleId={busVerrouilleId}
        suiviDecale={suiviDecale}
        onVerrouillerBus={verrouillerSuiviBus}
        onSuiviDecale={() => setSuiviDecale(true)}
      />

      {ecran === "carte" && (
        <>
          <IleStatut
            statutTexte={statutTexte}
            lignesInfo={lignesInfo}
            ids={idsCourants}
            lignesActives={lignesActivesCourantes}
            onBasculerLigne={basculerLigne}
            groupe={groupe}
            onChangerGroupe={setGroupe}
            onToutAfficher={toutAfficher}
            onToutMasquer={toutMasquer}
            direction={direction}
            onChangerDirection={setDirection}
            onRetourTableau={() => setEcran("tableau")}
            onVoirLigneDetail={() => ouvrirPanneauLigne(null)}
          />

          <BandeauAlertes
            alertes={donnees.alertes}
            lignesInfo={lignesInfo}
            onVoirLigne={(id) => ouvrirPanneauLigne(id)}
          />
        </>
      )}

      <BandeauSuivi
        suivi={suivi}
        couleurLigne={lignesInfo[alerte?.routeId]?.couleur}
        seuil={alerte?.seuilMinutes}
        onArreter={desarmerAlerte}
      />

      {messageFlash && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 -translate-x-1/2 bottom-20 z-[1200] bg-[var(--chrome-950)] text-white px-3.5 py-2 rounded-lg text-[13px] shadow-lg"
        >
          {messageFlash}
        </div>
      )}

      {ecran === "carte" && (
        <>
          <button
            onClick={ouvrirPanneauAlerte}
            aria-label="Alerte à l'approche"
            className={
              (feuilleOuverte ? "hidden " : "") +
              "fixed right-3.5 z-[1050] w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl leading-none active:scale-95 transition-[bottom] " +
              (alerteArmee ? "bg-[var(--amber-500)]" : "bg-white text-[var(--chrome-950)]")
            }
            style={{ bottom: hauteurBouton(1) }}
          >
            🔔
          </button>

          <button
            onClick={ouvrirPanneauArrets}
            aria-label="Arrêts proches et recherche"
            className={
              (feuilleOuverte ? "hidden " : "") +
              "fixed right-3.5 z-[1050] w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl leading-none active:scale-95 transition-[bottom] " +
              (panneauArretsOuvert ? "bg-[var(--amber-500)]" : "bg-white text-[var(--chrome-950)]")
            }
            style={{ bottom: hauteurBouton(2) }}
          >
            🚏
          </button>

          <button
            onClick={ouvrirPanneauFavoris}
            aria-label="Mes favoris"
            className={
              (feuilleOuverte ? "hidden " : "") +
              "fixed right-3.5 z-[1050] w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl leading-none active:scale-95 transition-[bottom] " +
              (panneauFavorisOuvert
                ? "bg-[var(--amber-500)]"
                : "bg-white text-[var(--chrome-950)]")
            }
            style={{ bottom: hauteurBouton(3) }}
          >
            ★
          </button>
        </>
      )}

      <FicheBus
        bus={busSuivi}
        lignesInfo={lignesInfo}
        onFermer={() => setBusSelectionneId(null)}
        onVoirLigne={
          busSuivi
            ? () => ouvrirPanneauLigne(String(busSuivi.ligne), String(busSuivi.direction))
            : undefined
        }
        onChoisirArret={(stopId) => {
          const a = reseau.arretsInfos[stopId];
          setBusSelectionneId(null);
          if (a) ouvrirFicheArret({ stopId, lat: a.lat, lon: a.lon, nom: a.nom });
          else {
            setArretCible(stopId);
            setPanneauArretsOuvert(true);
          }
        }}
      />

      <PanneauArrets
        key={"arrets-" + (arretCible || "liste")}
        ouvert={panneauArretsOuvert}
        onFermer={() => {
          setPanneauArretsOuvert(false);
          setArretCible(null);
        }}
        arretsInfos={reseau.arretsInfos}
        arretsParLigne={reseau.arrets}
        lignesInfo={lignesInfo}
        vehicules={donnees.vehicules}
        position={positionUtilisateur}
        onDemanderPosition={() => localiser({ recentrer: false })}
        positionEnCours={recentrageEnCours}
        onChoisirArret={(arret) => mapApiRef.current?.centrerSur(arret.lat, arret.lon, 16)}
        onCreerAlerte={creerAlertePourArret}
        arretInitial={arretCible}
      />

      <PanneauFavoris
        ouvert={panneauFavorisOuvert}
        onFermer={() => setPanneauFavorisOuvert(false)}
        arretsInfos={reseau.arretsInfos}
        lignesInfo={lignesInfo}
        vehicules={donnees.vehicules}
        lignesActives={lignesActivesCourantes}
        onChoisirArret={ouvrirFicheArret}
        onCreerAlerte={creerAlertePourArret}
        onBasculerAffichageLigne={basculerLigne}
      />

      <PanneauAlerte
        ouvert={panneauOuvert}
        onFermer={() => setPanneauOuvert(false)}
        lignesInfo={lignesInfo}
        ids={idsAlerte}
        mode={modeAlerte}
        onChangerMode={changerModeAlerte}
        onPartager={partagerAlerteCourante}
        onEnregistrer={enregistrerDepuisFormulaire}
        alertesProgrammees={alertesProgrammees}
        onArmerProgrammee={(a) => armerAlerte(a)}
        onSupprimerProgrammee={supprimerAlerteProgrammee}
        onDefinirRecurrence={definirRecurrence}
        ligneChoisie={ligneFormAlerte}
        onChangerLigne={(id) => {
          setLigneFormAlerte(id);
          const dirs = directionsDisponiblesPour(id);
          setDirectionFormAlerte(dirs[0]?.[0] ?? "");
          setArretFormAlerte("");
        }}
        directionsDisponibles={directionsDisponiblesPour(ligneFormAlerte)}
        directionChoisie={directionFormAlerte}
        onChangerDirection={(dir) => {
          setDirectionFormAlerte(dir);
          setArretFormAlerte("");
        }}
        arretsDisponibles={arretsDisponiblesPour(ligneFormAlerte, directionFormAlerte)}
        arretChoisi={arretFormAlerte}
        onChangerArret={setArretFormAlerte}
        seuil={seuilFormAlerte}
        onChangerSeuil={setSeuilFormAlerte}
        onActiver={activerAlerte}
        alerteArmee={alerteArmee}
        onDesactiver={() => {
          desarmerAlerte();
          setPanneauOuvert(false);
        }}
        avertissementArrierePlan={
          clePush
            ? "La notification est envoyée par le serveur : elle arrivera même si l'application est fermée ou l'écran verrouillé."
            : "L'alerte ne peut sonner que si l'application reste ouverte — l'écran est maintenu allumé pendant le suivi."
        }
      />

      {ligneDetail && (
        <PanneauLigne
          key={"ligne-" + ligneDetail.routeId}
          ouvert
          routeId={ligneDetail.routeId}
          sensInitial={ligneDetail.sens}
          ids={
            idsLignesEnDirect.includes(ligneDetail.routeId)
              ? idsLignesEnDirect
              : [ligneDetail.routeId, ...idsLignesEnDirect]
          }
          onChangerLigne={(id) => setLigneDetail({ routeId: id, sens: "tous" })}
          onFermer={() => setLigneDetail(null)}
          lignesInfo={lignesInfo}
          vehicules={donnees.vehicules}
          arretsParDirection={reseau.arretsParDirection}
          directionsDisponibles={directionsDisponiblesPour(ligneDetail.routeId)}
          alertes={donnees.alertes}
          onChoisirBus={(id) => {
            setLigneDetail(null);
            setBusSelectionneId(id);
            const b = donnees.vehicules.find((v) => v.id === id);
            if (b && Number.isFinite(b.lat) && Number.isFinite(b.lon)) {
              mapApiRef.current?.centrerSur(b.lat, b.lon, 15);
            }
          }}
          onOuvrirArrets={() => {
            setLigneDetail(null);
            ouvrirPanneauArrets();
          }}
          onAfficherSurCarte={afficherLigneSurCarte}
        />
      )}

      {ecran === "carte" && (
        <button
          onClick={recentrerSurMoi}
          aria-label="Centrer sur ma position"
          className={
            (feuilleOuverte ? "hidden " : "") +
            "fixed right-3.5 z-[1050] w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl leading-none active:scale-95 bg-[var(--amber-500)] text-[var(--chrome-950)] transition-[bottom] " +
            (recentrageEnCours ? "opacity-60" : "")
          }
          style={{ bottom: hauteurBouton(0) }}
        >
          ◉
        </button>
      )}

      {ecran === "carte" && busVerrouilleId && (
        <button
          onClick={() => (suiviDecale ? setSuiviDecale(false) : arreterSuiviBus())}
          aria-label={suiviDecale ? "Recentrer sur le bus suivi" : "Arrêter le suivi du bus"}
          className={
            (feuilleOuverte ? "hidden " : "") +
            "fixed left-3.5 z-[1050] h-12 px-4 rounded-full shadow-lg flex items-center gap-1.5 text-sm font-semibold leading-none active:scale-95 transition-[bottom] " +
            (suiviDecale
              ? "bg-[var(--amber-500)] text-[var(--chrome-950)]"
              : "bg-[var(--chrome-950)] text-white")
          }
          style={{ bottom: hauteurBouton(0) }}
        >
          {suiviDecale ? "⟳ Recentrer" : "🎯 Suivi"}
        </button>
      )}

      {ecran === "tableau" && (
        <TableauDeBord
          arretsInfos={reseau.arretsInfos}
          lignesInfo={lignesInfo}
          vehicules={donnees.vehicules}
          alertes={donnees.alertes}
          generatedAt={donnees.generated_at}
          erreur={horsLigne ? "Hors ligne — données figées" : erreur}
          position={positionUtilisateur}
          onDemanderPosition={() => localiser({ recentrer: false })}
          positionEnCours={recentrageEnCours}
          alertesProgrammees={alertesProgrammees}
          onArmerProgrammee={(a) => armerAlerte(a)}
          suiviActif={Boolean(suivi)}
          onOuvrirCarte={() => setEcran("carte")}
          onOuvrirArret={(arret) => {
            setEcran("carte");
            ouvrirFicheArret(arret);
          }}
          onCreerAlerte={(stopId) => {
            setEcran("carte");
            creerAlertePourArret(stopId);
          }}
          onVoirLigne={(id) => {
            setEcran("carte");
            ouvrirPanneauLigne(id);
          }}
        />
      )}
    </div>
  );
}
