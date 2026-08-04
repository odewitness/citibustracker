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
  formaterRetard,
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
  const [alerte, setAlerte] = useState(alerteInitiale); // {routeId, direction, stopId, nomArret, seuilMinutes}
  const [alerteArmee, setAlerteArmee] = useState(false);
  const [ligneFormAlerte, setLigneFormAlerte] = useState(alerteInitiale?.routeId || "");
  const [directionFormAlerte, setDirectionFormAlerte] = useState(alerteInitiale?.direction ?? "");
  const [arretFormAlerte, setArretFormAlerte] = useState(alerteInitiale?.stopId || "");
  const [seuilFormAlerte, setSeuilFormAlerte] = useState(alerteInitiale?.seuilMinutes || 5);

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
  useEffect(() => { alerteRef.current = alerte; }, [alerte]);
  useEffect(() => { alerteArmeeRef.current = alerteArmee; }, [alerteArmee]);

  function afficherMessage(texte) {
    setMessageFlash(texte);
    clearTimeout(afficherMessage._t);
    afficherMessage._t = setTimeout(() => setMessageFlash(""), 2600);
  }

  function nomLigne(routeId) {
    return lignesInfo[routeId]?.nom || routeId || "?";
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

  // --- Alerte à l'approche : sens (destinations réelles) et arrêts disponibles ---
  function directionsDisponiblesPour(routeId) {
    const dispo = new Map(); // direction -> libellé (destination réelle si connue)
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
    const idsDisponibles = Object.keys(lignesInfo);
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

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  function desarmerAlerte() {
    setAlerteArmee(false);
    setSuivi(null);
  }

  function declencherAlerte(minutesRestantes, routeId, nomArret) {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    jouerSon();
    const texte = `Bus ligne ${nomLigne(routeId)} à ${nomArret} dans ${Math.max(0, minutesRestantes)} min`;
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("🚌 Bus proche !", { body: texte, tag: "citibus-alerte" });
    }
    setSuivi({ statut: "imminent", texte });
    setTimeout(() => desarmerAlerte(), 90000);
  }

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

      {suivi && (
        <div
          className={
            "fixed left-0 right-0 bottom-0 z-[1080] px-4 pt-3 pb-3 rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.25)] " +
            (suivi.statut === "imminent"
              ? "bg-[var(--amber-500)] text-[var(--chrome-950)]"
              : "bg-[var(--chrome-950)] text-white")
          }
          style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl leading-none shrink-0">🚌</span>

            {suivi.statut === "suivi" ? (
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold truncate">
                  Ligne {suivi.ligneNom} → {suivi.arretNom}
                </div>
                <div className="flex items-center gap-2 text-[12px] text-white/80 mt-0.5 flex-wrap">
                  {suivi.horairePrevu && <span>Prévu à {suivi.horairePrevu}</span>}
                  {suivi.retard !== null && suivi.retard !== undefined && (
                    <span
                      className={
                        suivi.retard > 60 ? "text-[var(--amber-500)] font-semibold" : ""
                      }
                    >
                      • {formaterRetard(suivi.retard)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <span className="flex-1 text-[13.5px]">{suivi.texte}</span>
            )}

            {suivi.statut === "suivi" && (
              <div className="font-signage text-xl font-bold shrink-0 tabular-nums">
                {suivi.eta}
                <span className="text-[11px] font-sans font-normal ml-0.5">min</span>
              </div>
            )}

            <button
              onClick={desarmerAlerte}
              aria-label="Arrêter le suivi"
              className={
                "shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm leading-none " +
                (suivi.statut === "imminent" ? "bg-black/10" : "bg-white/15")
              }
            >
              ✕
            </button>
          </div>
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
          "fixed right-3.5 z-[1050] w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl leading-none active:scale-95 transition-[bottom] " +
          (alerteArmee ? "bg-[var(--amber-500)]" : "bg-white text-[var(--chrome-950)]")
        }
        style={{
          bottom: suivi
            ? "calc(150px + env(safe-area-inset-bottom))"
            : "calc(78px + env(safe-area-inset-bottom))",
        }}
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
      />

      <button
        onClick={recentrerSurMoi}
        aria-label="Centrer sur ma position"
        className={
          "fixed right-3.5 z-[1050] w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl leading-none active:scale-95 bg-[var(--amber-500)] text-[var(--chrome-950)] transition-[bottom] " +
          (recentrageEnCours ? "opacity-60" : "")
        }
        style={{
          bottom: suivi
            ? "calc(90px + env(safe-area-inset-bottom))"
            : "max(18px, env(safe-area-inset-bottom))",
        }}
      >
        ◉
      </button>
    </div>
  );
}
