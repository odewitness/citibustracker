import { useEffect, useRef, useState } from "react";
import CarteBus from "./components/CarteBus.jsx";
import IleStatut from "./components/IleStatut.jsx";
import PanneauAlerte from "./components/PanneauAlerte.jsx";
import {
  LIGNES_AUTORISEES_NORM,
  normaliser,
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
  const [lignesInfo, setLignesInfo] = useState({});
  const [lignesActives, setLignesActives] = useState(
    new Set(preferencesInitiales?.lignesActives || [])
  );
  const [direction, setDirection] = useState(preferencesInitiales?.direction || "tous");
  const [erreur, setErreur] = useState(null);
  const [messageFlash, setMessageFlash] = useState("");

  const lignesInitialiseesRef = useRef(false);
  const mapApiRef = useRef(null);

  // --- Alerte à l'approche ---
  const [panneauOuvert, setPanneauOuvert] = useState(false);
  const [alerte, setAlerte] = useState(alerteInitiale);
  const [alerteArmee, setAlerteArmee] = useState(false);
  const [ligneFormAlerte, setLigneFormAlerte] = useState(alerteInitiale?.routeId || "");
  const [arretFormAlerte, setArretFormAlerte] = useState(alerteInitiale?.stopId || "");
  const [seuilFormAlerte, setSeuilFormAlerte] = useState(alerteInitiale?.seuilMinutes || 5);
  const [bandeauTexte, setBandeauTexte] = useState("");
  const [bandeauImminent, setBandeauImminent] = useState(false);

  // Miroirs en ref pour éviter les fermetures obsolètes dans le polling
  const alerteRef = useRef(alerte);
  const alerteArmeeRef = useRef(alerteArmee);
  const derniereCleDeclencheeRef = useRef(null);
  useEffect(() => { alerteRef.current = alerte; }, [alerte]);
  useEffect(() => { alerteArmeeRef.current = alerteArmee; }, [alerteArmee]);

  function afficherMessage(texte) {
    setMessageFlash(texte);
    clearTimeout(afficherMessage._t);
    afficherMessage._t = setTimeout(() => setMessageFlash(""), 2600);
  }

  // --- Récupération des données (toutes les 15s) ---
  useEffect(() => {
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
          const filtre = {};
          Object.keys(data.lignes).forEach((routeId) => {
            if (LIGNES_AUTORISEES_NORM.includes(normaliser(data.lignes[routeId].nom))) {
              filtre[routeId] = data.lignes[routeId];
            }
          });
          setLignesInfo(filtre);
          if (!preferencesInitiales) {
            setLignesActives(new Set(Object.keys(filtre)));
          }
          lignesInitialiseesRef.current = true;
        }

        verifierAlerte(data);
      } catch (e) {
        setErreur("Connexion perdue");
      }
    }
    recuperer();
    const id = setInterval(recuperer, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ecrireStockage(CLE_PREFERENCES, { lignesActives: Array.from(lignesActives), direction });
  }, [lignesActives, direction]);

  function basculerLigne(routeId) {
    setLignesActives((prec) => {
      const suivant = new Set(prec);
      if (suivant.has(routeId)) suivant.delete(routeId);
      else suivant.add(routeId);
      return suivant;
    });
  }

  // --- Recentrage sur ma position ---
  const [recentrageEnCours, setRecentrageEnCours] = useState(false);
  function recentrerSurMoi() {
    if (!navigator.geolocation) {
      afficherMessage("Géolocalisation non supportée par ce navigateur");
      return;
    }
    setRecentrageEnCours(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRecentrageEnCours(false);
        mapApiRef.current?.centrerSur(pos.coords.latitude, pos.coords.longitude, 16);
        mapApiRef.current?.afficherPositionUtilisateur(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setRecentrageEnCours(false);
        afficherMessage("Position indisponible — vérifie l'autorisation de localisation");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // --- Alerte à l'approche : liste des arrêts dispo pour la ligne choisie dans le formulaire ---
  function arretsDisponiblesPour(routeId) {
    const dispo = new Map();
    donnees.vehicules.forEach((v) => {
      if (String(v.ligne) !== String(routeId)) return;
      (v.prochains_arrets || []).forEach((a) => {
        if (a.stop_id) dispo.set(a.stop_id, a.nom);
      });
    });
    return Array.from(dispo.entries());
  }

  function ouvrirPanneauAlerte() {
    if (alerte) {
      setLigneFormAlerte(alerte.routeId);
      setArretFormAlerte(alerte.stopId);
      setSeuilFormAlerte(alerte.seuilMinutes);
    } else if (!ligneFormAlerte && Object.keys(lignesInfo).length > 0) {
      setLigneFormAlerte(Object.keys(lignesInfo)[0]);
    }
    setPanneauOuvert(true);
  }

  function activerAlerte() {
    if (!arretFormAlerte) {
      afficherMessage("Choisis un arrêt disponible");
      return;
    }
    const nomArret =
      arretsDisponiblesPour(ligneFormAlerte).find(([id]) => id === arretFormAlerte)?.[1] || "";
    const nouvelleAlerte = {
      routeId: ligneFormAlerte,
      stopId: arretFormAlerte,
      nomArret,
      seuilMinutes: seuilFormAlerte,
    };
    setAlerte(nouvelleAlerte);
    ecrireStockage(CLE_ALERTE, nouvelleAlerte);
    setAlerteArmee(true);
    derniereCleDeclencheeRef.current = null;
    setBandeauImminent(false);
    setBandeauTexte("Recherche du prochain bus…");
    setPanneauOuvert(false);

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  function desarmerAlerte() {
    setAlerteArmee(false);
    setBandeauTexte("");
    setBandeauImminent(false);
  }

  function declencherAlerte(minutesRestantes, routeId, nomArret) {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    jouerSon();
    const texte = `Bus ligne ${lignesInfo[routeId]?.nom} à ${nomArret} dans ${Math.max(
      0,
      minutesRestantes
    )} min`;
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("🚌 Bus proche !", { body: texte, tag: "citibus-alerte" });
    }
    setBandeauImminent(true);
    setBandeauTexte("🚌 " + texte);
    setTimeout(() => desarmerAlerte(), 90000);
  }

  // Recalcule l'état de l'alerte à chaque nouvelle donnée reçue
  function verifierAlerte(data) {
    const alerteActuelle = alerteRef.current;
    if (!alerteArmeeRef.current || !alerteActuelle) return;

    let meilleurBus = null;
    let meilleurEta = null;
    let meilleureArrivee = null;

    (data.vehicules || []).forEach((v) => {
      if (String(v.ligne) !== String(alerteActuelle.routeId)) return;
      (v.prochains_arrets || []).forEach((a) => {
        if (a.stop_id !== alerteActuelle.stopId || !a.arrivee) return;
        const etaMinutes = (a.arrivee * 1000 - Date.now()) / 60000;
        if (etaMinutes < -1) return;
        if (meilleurEta === null || etaMinutes < meilleurEta) {
          meilleurEta = etaMinutes;
          meilleurBus = v;
          meilleureArrivee = a.arrivee;
        }
      });
    });

    if (!meilleurBus) {
      setBandeauTexte((texte) =>
        bandeauImminent ? texte : `Aucun bus prévu pour le moment à ${alerteActuelle.nomArret}…`
      );
      return;
    }

    const cleCePassage = `${alerteActuelle.routeId}|${alerteActuelle.stopId}|${meilleureArrivee}`;
    if (derniereCleDeclencheeRef.current !== cleCePassage) {
      mapApiRef.current?.suivre(meilleurBus.lat, meilleurBus.lon);
      setBandeauTexte(
        `Ligne ${lignesInfo[alerteActuelle.routeId]?.nom} → ${alerteActuelle.nomArret} : arrivée dans ${Math.max(
          0,
          Math.round(meilleurEta)
        )} min`
      );
    }

    if (meilleurEta <= alerteActuelle.seuilMinutes && derniereCleDeclencheeRef.current !== cleCePassage) {
      derniereCleDeclencheeRef.current = cleCePassage;
      declencherAlerte(Math.round(meilleurEta), alerteActuelle.routeId, alerteActuelle.nomArret);
    }
  }

  const nbVisibles = donnees.vehicules.filter(
    (b) =>
      lignesActives.has(String(b.ligne)) &&
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
        lignesActives={lignesActives}
        direction={direction}
        mapApiRef={mapApiRef}
      />

      <IleStatut
        statutTexte={statutTexte}
        lignesInfo={lignesInfo}
        lignesActives={lignesActives}
        onBasculerLigne={basculerLigne}
        direction={direction}
        onChangerDirection={setDirection}
      />

      {bandeauTexte && (
        <div
          className={
            "fixed left-1/2 -translate-x-1/2 top-[118px] z-[1080] px-4 py-2.5 rounded-xl text-[13px] shadow-lg max-w-[88vw] text-center " +
            (bandeauImminent
              ? "bg-[var(--amber-500)] text-[var(--chrome-950)] font-bold"
              : "bg-[var(--chrome-950)] text-white")
          }
        >
          {bandeauTexte}
        </div>
      )}

      {messageFlash && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-20 z-[1200] bg-[var(--chrome-950)] text-white px-3.5 py-2 rounded-lg text-[13px] shadow-lg">
          {messageFlash}
        </div>
      )}

      <button
        onClick={ouvrirPanneauAlerte}
        aria-label="Alerte à l'approche"
        className={
          "fixed left-3.5 z-[1050] w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl leading-none active:scale-95 " +
          (alerteArmee ? "bg-[var(--amber-500)]" : "bg-white text-[var(--chrome-950)]")
        }
        style={{ bottom: "max(18px, env(safe-area-inset-bottom))" }}
      >
        🔔
      </button>

      <PanneauAlerte
        ouvert={panneauOuvert}
        onFermer={() => setPanneauOuvert(false)}
        lignesInfo={lignesInfo}
        ligneChoisie={ligneFormAlerte}
        onChangerLigne={(id) => {
          setLigneFormAlerte(id);
          setArretFormAlerte("");
        }}
        arretsDisponibles={arretsDisponiblesPour(ligneFormAlerte)}
        arretChoisi={arretFormAlerte}
        onChangerArret={setArretFormAlerte}
        seuil={seuilFormAlerte}
        onChangerSeuil={setSeuilFormAlerte}
        onActiver={activerAlerte}
      />

      <button
        onClick={recentrerSurMoi}
        aria-label="Centrer sur ma position"
        className={
          "fixed right-3.5 z-[1050] w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl leading-none active:scale-95 bg-[var(--amber-500)] text-[var(--chrome-950)] " +
          (recentrageEnCours ? "opacity-60" : "")
        }
        style={{ bottom: "max(18px, env(safe-area-inset-bottom))" }}
      >
        ◉
      </button>
    </div>
  );
}
