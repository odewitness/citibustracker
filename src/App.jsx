import { useEffect, useMemo, useRef, useState } from "react";
import CarteBus from "./components/CarteBus.jsx";
import IleStatut from "./components/IleStatut.jsx";
import PanneauAlerte from "./components/PanneauAlerte.jsx";
import BandeauSuivi from "./components/BandeauSuivi.jsx";
import PanneauArrets from "./components/PanneauArrets.jsx";
import { abonnerAlerte, annulerAlerteServeur, lireClePush } from "./push.js";
import {
  GROUPE_PRINCIPALES,
  GROUPE_AUTRES,
  estLignePrincipale,
  trierParOrdreAutorise,
  trierParNom,
  lireStockage,
  ecrireStockage,
  jouerSon,
} from "./utils.js";

const CLE_PREFERENCES = "citibus:preferences";
const CLE_ALERTE = "citibus:alerte";

export default function App() {
  const preferencesInitiales = lireStockage(CLE_PREFERENCES);
  const alerteInitiale = lireStockage(CLE_ALERTE);

  const [donnees, setDonnees] = useState({ vehicules: [], lignes: {}, generated_at: null });
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

  const lignesInitialiseesRef = useRef(false);
  const mapApiRef = useRef(null);

  // --- Alerte à l'approche ---
  const [panneauOuvert, setPanneauOuvert] = useState(false);
  const [alerte, setAlerte] = useState(alerteInitiale); // {routeId, direction, stopId, nomArret, seuilMinutes}
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
      if (document.visibilityState === "visible") demarrer();
      else if (!alerteArmeeRef.current) arreter();
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
    });
  }, [lignesActives, autresMasquees, groupe, direction]);

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
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  const recentrerSurMoi = () => localiser({ recentrer: true });

  // --- Panneau des arrêts (proximité + recherche) ---
  const [panneauArretsOuvert, setPanneauArretsOuvert] = useState(false);

  function ouvrirPanneauArrets() {
    setPanneauOuvert(false);
    setPanneauArretsOuvert(true);
    // Sans position connue, la liste ne peut être triée que par nom : on tente
    // la localisation dès l'ouverture plutôt que d'attendre un second geste.
    if (!positionUtilisateur) localiser({ recentrer: false });
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
    if (alerte) setSeuilFormAlerte(alerte.seuilMinutes);
    setPanneauArretsOuvert(false);
    setPanneauOuvert(true);
  }

  function activerAlerte() {
    if (!arretFormAlerte) {
      afficherMessage("Choisis un arrêt disponible");
      return;
    }
    const nomArret =
      arretsDisponiblesPour(ligneFormAlerte, directionFormAlerte).find(
        ([id]) => id === arretFormAlerte
      )?.[1] || "";
    const nouvelleAlerte = {
      routeId: ligneFormAlerte,
      direction: directionFormAlerte,
      stopId: arretFormAlerte,
      nomArret,
      seuilMinutes: seuilFormAlerte,
    };
    setAlerte(nouvelleAlerte);
    ecrireStockage(CLE_ALERTE, nouvelleAlerte);
    setAlerteArmee(true);
    derniereCleDeclencheeRef.current = null;
    setSuivi({ statut: "recherche", texte: "Recherche du prochain bus…" });
    setPanneauOuvert(false);

    // Si le déploiement dispose de clés VAPID, on confie la surveillance au
    // serveur : c'est la seule façon d'être prévenu écran verrouillé.
    if (clePush) {
      abonnerAlerte(clePush, { ...nouvelleAlerte, nomLigne: nomLigne(ligneFormAlerte) }).then(
        (ok) => {
          setAlerteServeurActive(ok);
          afficherMessage(
            ok
              ? "Alerte activée — tu peux fermer l'application"
              : "Alerte activée — garde l'application ouverte"
          );
        }
      );
    } else if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  function desarmerAlerte() {
    clearTimeout(minuteurDesarmementRef.current);
    minuteurDesarmementRef.current = null;
    setAlerteArmee(false);
    setAlerteServeurActive(false);
    setSuivi(null);
    annulerAlerteServeur();
  }

  function declencherAlerte(minutesRestantes, routeId, nomArret) {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    jouerSon();
    const texte = `Bus ligne ${nomLigne(routeId)} à ${nomArret} dans ${Math.max(0, minutesRestantes)} min`;
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("🚌 Bus proche !", { body: texte, tag: "citibus-alerte" });
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
      });
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
  const feuilleOuverte = panneauArretsOuvert || panneauOuvert;

  function hauteurBouton(rang) {
    return `calc(${(suivi ? 90 : 18) + rang * 60}px + env(safe-area-inset-bottom))`;
  }

  const nbVisibles = donnees.vehicules.filter(
    (b) =>
      lignesActivesCourantes.has(String(b.ligne)) &&
      (direction === "tous" || String(b.direction) === direction) &&
      lignesInfo[b.ligne]
  ).length;

  const statutTexte = erreur
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
      />

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
      />

      <BandeauSuivi
        suivi={suivi}
        couleurLigne={lignesInfo[alerte?.routeId]?.couleur}
        seuil={alerte?.seuilMinutes}
        onArreter={desarmerAlerte}
      />

      {messageFlash && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-20 z-[1200] bg-[var(--chrome-950)] text-white px-3.5 py-2 rounded-lg text-[13px] shadow-lg">
          {messageFlash}
        </div>
      )}

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

      <PanneauArrets
        ouvert={panneauArretsOuvert}
        onFermer={() => setPanneauArretsOuvert(false)}
        arretsInfos={reseau.arretsInfos}
        lignesInfo={lignesInfo}
        vehicules={donnees.vehicules}
        position={positionUtilisateur}
        onDemanderPosition={() => localiser({ recentrer: false })}
        positionEnCours={recentrageEnCours}
        onChoisirArret={(arret) => mapApiRef.current?.centrerSur(arret.lat, arret.lon, 16)}
      />

      <PanneauAlerte
        ouvert={panneauOuvert}
        onFermer={() => setPanneauOuvert(false)}
        lignesInfo={lignesInfo}
        ids={idsAlerte}
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
    </div>
  );
}
