import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import { busFantome, categorieRetard, COULEUR_RETARD } from "../utils.js";

// Icône de bus : pastille colorée, numéro de ligne, flèche de cap si connue.
// - direction : "0"/"1" → bordure pleine ou pointillée, pour distinguer les sens
//   d'un coup d'œil sans avoir à sélectionner un bus.
// - etat : "normal" | "selectionne" | "attenue" | "suivi" → mis en évidence /
//   estompé quand l'utilisateur a tapé sur un bus précis pour le suivre parmi
//   d'autres de la même ligne ; "suivi" = suivi caméra armé par un appui long.
function creerIconeBus(couleur, texte, cap, direction, etat, retardCat = "inconnu", fantome = false) {
  const taille = etat === "selectionne" ? 38 : 30;
  const bordure = String(direction) === "1" ? "3px dashed #fff" : "2px solid #fff";
  // Anneau de ponctualité (vert à l'heure, ambre / rouge en retard, bleu en
  // avance) — sauf sur le bus sélectionné ou suivi, dont l'anneau ambre prime.
  const couleurAnneau = COULEUR_RETARD[retardCat];
  const anneau =
    etat === "selectionne"
      ? "box-shadow:0 0 0 3px var(--amber-500), 0 2px 10px rgba(0,0,0,.45);"
      : etat === "suivi"
        ? "box-shadow:0 0 0 3px var(--amber-500), 0 2px 8px rgba(0,0,0,.4);"
        : retardCat !== "inconnu" && !fantome
          ? `box-shadow:0 0 0 2px ${couleurAnneau}, 0 2px 6px rgba(0,0,0,.35);`
          : "box-shadow:0 2px 6px rgba(0,0,0,.35);";
  // Bus « fantôme » (position figée) : nettement estompé et désaturé pour ne pas
  // le confondre avec un bus qui roule.
  const opacite = fantome ? 0.35 : etat === "attenue" ? 0.25 : 1;
  const filtre = fantome ? "filter:grayscale(0.8);" : "";
  const fleche =
    cap !== null && cap !== undefined && !fantome
      ? `<div class="bus-cap" style="transform:translateX(-50%) rotate(${cap}deg);"></div>`
      : "";
  return L.divIcon({
    html: `<div style="position:relative;opacity:${opacite};${filtre}">${fleche}
      <div style="width:${taille}px;height:${taille}px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:${etat === "selectionne" ? 13 : 11}px;font-weight:700;border:${bordure};${anneau}
      background:${couleur};">${texte}</div></div>`,
    className: "",
    iconSize: [taille, taille],
    iconAnchor: [taille / 2, taille / 2],
    popupAnchor: [0, -taille / 2],
  });
}

// Signature de l'icône : tant qu'elle ne change pas, on ne touche pas au DOM du
// marqueur — sinon l'élément est recréé à chaque poll et l'animation de
// déplacement repart de zéro.
function cleIcone(bus, info, etat) {
  return [
    info.couleur,
    info.nom,
    bus.cap,
    bus.direction,
    etat,
    categorieRetard(bus.retard),
    busFantome(bus) ? "f" : "",
  ].join("|");
}

function appliquerIcone(entree, etat) {
  const cle = cleIcone(entree.bus, entree.info, etat);
  if (entree.cleIcone === cle) return;
  entree.cleIcone = cle;
  entree.marker.setIcon(
    creerIconeBus(
      entree.info.couleur,
      entree.info.nom,
      entree.bus.cap,
      entree.bus.direction,
      etat,
      categorieRetard(entree.bus.retard),
      busFantome(entree.bus)
    )
  );
}

export default function CarteBus({
  vehicules,
  lignesInfo,
  lignesActives,
  direction,
  traces,
  arretsParLigne,
  arretsInfos,
  mapApiRef,
  busSelectionneId = null,
  onChangerBusSelectionne,
  onOuvrirArret,
  busVerrouilleId = null,
  suiviDecale = false,
  onVerrouillerBus,
  onSuiviDecale,
}) {
  const conteneurRef = useRef(null);
  const carteRef = useRef(null);
  const couchesBusRef = useRef(null);
  const couchesReseauRef = useRef(null);
  const marqueurMoiRef = useRef(null);
  const premierChargementRef = useRef(true);
  // Marqueurs de bus actuellement sur la carte, indexés par id de véhicule.
  // C'est la pièce maîtresse du rafraîchissement : on déplace et on met à jour
  // ces marqueurs plutôt que de vider la couche, car un clearLayers() détruirait
  // le marqueur cliqué et refermerait son popup — à la sélection comme à chaque
  // relevé de 15 s.
  const marqueursRef = useRef(new Map());

  // Bus actuellement isolé par l'utilisateur (tap-to-focus), pour le distinguer
  // des autres bus de la même ligne — et alimenter la fiche « trajet complet »
  // remontée jusqu'à App. La sélection est pilotée par le parent : null = aucune.
  const busSelectionneIdRef = useRef(busSelectionneId);
  // Référence stable vers le callback du parent : les gestionnaires de clic
  // Leaflet sont posés une seule fois, ils ne doivent pas capturer une version
  // périmée de la prop.
  const onChangerRef = useRef(onChangerBusSelectionne);
  useEffect(() => { onChangerRef.current = onChangerBusSelectionne; }, [onChangerBusSelectionne]);
  const selectionner = useCallback((valeur) => onChangerRef.current?.(valeur), []);

  // Idem pour l'ouverture de la fiche d'arrêt : le gestionnaire de clic des
  // pastilles d'arrêt est posé au (re)dessin du réseau, il ne doit pas figer une
  // version périmée de la prop.
  const onOuvrirArretRef = useRef(onOuvrirArret);
  useEffect(() => { onOuvrirArretRef.current = onOuvrirArret; }, [onOuvrirArret]);

  useEffect(() => { busSelectionneIdRef.current = busSelectionneId; }, [busSelectionneId]);

  // --- Suivi caméra d'un bus (appui long) ---
  // busVerrouilleId : bus que la carte garde centré à chaque relevé.
  // suiviDecale : l'utilisateur a repris la main (zoom / panoramique) → on gèle
  //   le recentrage jusqu'à ce qu'il appuie sur « Recentrer » (piloté par App).
  const busVerrouilleIdRef = useRef(busVerrouilleId);
  useEffect(() => { busVerrouilleIdRef.current = busVerrouilleId; }, [busVerrouilleId]);
  const suiviDecaleRef = useRef(suiviDecale);
  useEffect(() => { suiviDecaleRef.current = suiviDecale; }, [suiviDecale]);
  const onVerrouillerBusRef = useRef(onVerrouillerBus);
  useEffect(() => { onVerrouillerBusRef.current = onVerrouillerBus; }, [onVerrouillerBus]);
  const onSuiviDecaleRef = useRef(onSuiviDecale);
  useEffect(() => { onSuiviDecaleRef.current = onSuiviDecale; }, [onSuiviDecale]);
  // Verrou anti-boucle : un recadrage déclenché par notre code ne doit pas être
  // pris pour un geste utilisateur (sinon le suivi se mettrait en pause tout
  // seul au premier relevé).
  const mouvementProgrammatiqueRef = useRef(false);
  const minuteurMouvementRef = useRef(null);
  const dernierVerrouRef = useRef(null);
  const decalePrecedentRef = useRef(suiviDecale);

  const bougerProgrammatiquement = useCallback((fn) => {
    mouvementProgrammatiqueRef.current = true;
    clearTimeout(minuteurMouvementRef.current);
    fn();
    minuteurMouvementRef.current = setTimeout(() => {
      mouvementProgrammatiqueRef.current = false;
    }, 700);
  }, []);

  // État visuel d'un marqueur : sélection (fiche) > suivi caméra > atténué.
  const etatMarqueur = useCallback((busId) => {
    const sel = busSelectionneIdRef.current;
    if (sel === busId) return "selectionne";
    if (busVerrouilleIdRef.current === busId) return "suivi";
    if (sel) return "attenue";
    return "normal";
  }, []);

  // Ligne du bus sélectionné (pour atténuer les tracés des autres lignes aussi).
  // Calculé à chaque rendu (peu coûteux) mais utilisé comme dépendance d'effet
  // sous forme de simple chaîne, pour ne PAS redessiner le réseau à chaque
  // poll de 15s — seulement quand la sélection change réellement.
  const busSelectionne = busSelectionneId
    ? vehicules.find((v) => v.id === busSelectionneId) || null
    : null;
  const ligneSelectionnee = busSelectionne ? String(busSelectionne.ligne) : null;

  // Initialisation de la carte (une seule fois)
  useEffect(() => {
    const carte = L.map(conteneurRef.current, { zoomControl: false }).setView([43.18, 3.0], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(carte);
    // Le réseau (tracés + arrêts) est ajouté avant les bus, pour rester en dessous visuellement.
    couchesReseauRef.current = L.layerGroup().addTo(carte);
    couchesBusRef.current = L.layerGroup().addTo(carte);
    carteRef.current = carte;

    // Déplacement fluide des bus d'un relevé à l'autre (cf. .bus-fluide dans
    // index.css). On retire la transition pendant les zooms : Leaflet y
    // recalcule toutes les positions d'un coup, et les animer donnerait
    // l'impression que les bus glissent à travers la carte.
    const conteneur = conteneurRef.current;
    conteneur.classList.add("bus-fluide");
    carte.on("zoomstart", () => conteneur.classList.remove("bus-fluide"));
    carte.on("zoomend", () => conteneur.classList.add("bus-fluide"));

    // Un tap sur la carte (pas sur un marqueur, Leaflet ne propage pas ces
    // clics-là) désélectionne le bus actuellement isolé.
    carte.on("click", () => selectionner(null));

    // Pendant un suivi caméra, tout geste manuel de recadrage (glissement ou
    // zoom) met le suivi en pause et fait apparaître le bouton « Recentrer ».
    // On ignore les recadrages que le suivi lui-même déclenche.
    function surGesteManuel() {
      if (!busVerrouilleIdRef.current || suiviDecaleRef.current) return;
      if (mouvementProgrammatiqueRef.current) return;
      onSuiviDecaleRef.current?.();
    }
    carte.on("dragstart", surGesteManuel);
    carte.on("zoomstart", surGesteManuel);

    // On expose quelques méthodes utiles au composant parent (recentrage, suivi).
    // Chaque recadrage passe par bougerProgrammatiquement() pour ne pas être pris
    // pour un geste utilisateur mettant le suivi caméra en pause.
    if (mapApiRef) {
      mapApiRef.current = {
        centrerSur(lat, lon, zoomMin) {
          const zoom = zoomMin ? Math.max(carte.getZoom(), zoomMin) : carte.getZoom();
          bougerProgrammatiquement(() => carte.setView([lat, lon], zoom));
        },
        suivre(lat, lon) {
          bougerProgrammatiquement(() => {
            carte.panTo([lat, lon], { animate: true });
            if (carte.getZoom() < 15) carte.setZoom(15);
          });
        },
        ajusterSur(points) {
          if (!Array.isArray(points) || points.length === 0) return;
          bougerProgrammatiquement(() => carte.fitBounds(points, { maxZoom: 15, padding: [50, 50] }));
        },
        afficherPositionUtilisateur(lat, lon) {
          if (marqueurMoiRef.current) carte.removeLayer(marqueurMoiRef.current);
          marqueurMoiRef.current = L.marker([lat, lon], {
            icon: L.divIcon({
              html: '<div class="moi-icone"></div>',
              className: "",
              iconSize: [18, 18],
              iconAnchor: [9, 9],
            }),
            zIndexOffset: 1000,
          }).addTo(carte);
        },
      };
    }

    return () => carte.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Met à jour les marqueurs de bus à chaque nouvelle donnée / changement de filtre.
  // On déplace les marqueurs existants au lieu de vider la couche : un
  // clearLayers() détruisait le marqueur cliqué et refermait donc son popup
  // toutes les 15 secondes, en pleine lecture.
  useEffect(() => {
    const couche = couchesBusRef.current;
    if (!couche) return;

    const bounds = [];
    const vus = new Set();

    vehicules.forEach((bus) => {
      if (!lignesActives.has(String(bus.ligne))) return;
      if (direction !== "tous" && String(bus.direction) !== direction) return;
      const info = lignesInfo[bus.ligne];
      if (!info) return;
      // Un véhicule peut apparaître dans le flux sans position exploitable :
      // sans ce garde-fou, Leaflet reçoit des coordonnées NaN et lève une erreur.
      if (!Number.isFinite(bus.lat) || !Number.isFinite(bus.lon)) return;

      vus.add(bus.id);
      bounds.push([bus.lat, bus.lon]);

      const etat = etatMarqueur(bus.id);

      const existant = marqueursRef.current.get(bus.id);
      if (existant) {
        existant.bus = bus;
        existant.info = info;
        existant.marker.setLatLng([bus.lat, bus.lon]);
        appliquerIcone(existant, etat);
        return;
      }

      // Pas de popup Leaflet sur les bus : un tap ouvre directement la fiche
      // « trajet complet » (FicheBus), qui reprend et enrichit ces infos. Une
      // bulle en plus restait affichée derrière la fiche puis après sa fermeture.
      const marker = L.marker([bus.lat, bus.lon], {
        icon: creerIconeBus(
          info.couleur,
          info.nom,
          bus.cap,
          bus.direction,
          etat,
          categorieRetard(bus.retard),
          busFantome(bus)
        ),
      });
      // Appui long (~500 ms) sans glisser : arme / change le suivi caméra du
      // bus. Un simple tap garde son rôle (sélection + fiche « trajet complet »).
      // On écoute l'élément DOM du marqueur : L.DivIcon.createIcon() le réutilise
      // d'un setIcon() à l'autre, les écouteurs survivent donc aux relevés.
      let minuteurAppui = null;
      let appuiLongArme = false;
      const annulerAppui = () => {
        clearTimeout(minuteurAppui);
        carteRef.current?.off("movestart", annulerAppui);
      };
      const demarrerAppui = () => {
        appuiLongArme = false;
        clearTimeout(minuteurAppui);
        carteRef.current?.on("movestart", annulerAppui);
        minuteurAppui = setTimeout(() => {
          appuiLongArme = true;
          carteRef.current?.off("movestart", annulerAppui);
          if (navigator.vibrate) navigator.vibrate(30);
          onVerrouillerBusRef.current?.(bus.id);
        }, 500);
      };
      marker.on("click", () => {
        // Le clic qui suit un appui long ne doit pas re-basculer la sélection.
        if (appuiLongArme) {
          appuiLongArme = false;
          return;
        }
        selectionner(busSelectionneIdRef.current === bus.id ? null : bus.id);
      });
      couche.addLayer(marker);
      // getElement() n'existe qu'une fois le marqueur ajouté à la carte.
      const el = marker.getElement();
      if (el) {
        el.addEventListener("pointerdown", demarrerAppui);
        el.addEventListener("pointerup", annulerAppui);
        el.addEventListener("pointercancel", annulerAppui);
        el.addEventListener("pointerleave", annulerAppui);
      }
      marqueursRef.current.set(bus.id, {
        marker,
        bus,
        info,
        cleIcone: cleIcone(bus, info, etat),
      });
    });

    // Bus disparus du flux ou masqués par les filtres
    marqueursRef.current.forEach((entree, id) => {
      if (vus.has(id)) return;
      couche.removeLayer(entree.marker);
      marqueursRef.current.delete(id);
    });

    if (premierChargementRef.current && bounds.length > 0) {
      carteRef.current.fitBounds(bounds, { maxZoom: 15, padding: [40, 100] });
      premierChargementRef.current = false;
    }
  }, [vehicules, lignesInfo, lignesActives, direction, selectionner, etatMarqueur]);

  // Met à jour l'icône des marqueurs déjà présents quand la sélection ou le
  // suivi caméra change, sans toucher à la couche ni aux popups : c'est ce qui
  // permet au popup du bus cliqué de rester ouvert.
  useEffect(() => {
    marqueursRef.current.forEach((entree) => {
      appliquerIcone(entree, etatMarqueur(entree.bus.id));
    });
  }, [busSelectionneId, busVerrouilleId, etatMarqueur]);

  // Suivi caméra : garde le bus verrouillé centré à chaque relevé, tant que
  // l'utilisateur n'a pas repris la main. Premier cadrage (ou reprise après
  // « Recentrer ») : setView, avec un zoom minimal utile. Relevés suivants :
  // simple panoramique fluide, sans toucher au zoom choisi par l'utilisateur.
  useEffect(() => {
    const carte = carteRef.current;
    const cible = busVerrouilleId
      ? vehicules.find((v) => v.id === busVerrouilleId) || null
      : null;
    const pos =
      cible && Number.isFinite(cible.lat) && Number.isFinite(cible.lon) ? cible : null;

    const reprise = decalePrecedentRef.current && !suiviDecale;
    decalePrecedentRef.current = suiviDecale;

    if (!busVerrouilleId) {
      dernierVerrouRef.current = null;
      return;
    }
    if (!carte || !pos || suiviDecale) return;

    const premierCadrage = dernierVerrouRef.current !== busVerrouilleId;
    dernierVerrouRef.current = busVerrouilleId;

    bougerProgrammatiquement(() => {
      if (premierCadrage || reprise) {
        carte.setView([pos.lat, pos.lon], Math.max(carte.getZoom(), 15), { animate: true });
      } else {
        carte.panTo([pos.lat, pos.lon], { animate: true });
      }
    });
  }, [vehicules, busVerrouilleId, suiviDecale, bougerProgrammatiquement]);

  // Redessine les tracés de lignes + arrêts cliquables — quand la sélection de
  // lignes change, ou quand la ligne du bus mis en avant change (mais PAS à
  // chaque poll de 15s : ligneSelectionnee est une simple chaîne stable tant
  // que le même bus reste sélectionné, donc pas de redessin inutile).
  useEffect(() => {
    const couche = couchesReseauRef.current;
    if (!couche || !traces || !arretsParLigne || !arretsInfos) return;
    couche.clearLayers();

    const arretsDejaAffiches = new Set();

    Object.keys(lignesInfo).forEach((routeId) => {
      if (!lignesActives.has(routeId)) return;
      const info = lignesInfo[routeId];
      const estLigneAttenuee = ligneSelectionnee !== null && ligneSelectionnee !== routeId;

      // Tracé de la ligne, par direction (plein = sens 0, pointillé = sens 1)
      const tracesLigne = traces[routeId] || {};
      Object.keys(tracesLigne).forEach((dirKey) => {
        const estPointille = dirKey === "1";
        (tracesLigne[dirKey] || []).forEach((points) => {
          if (points.length < 2) return;
          L.polyline(points, {
            color: info.couleur,
            weight: 4,
            opacity: estLigneAttenuee ? 0.12 : 0.55,
            dashArray: estPointille ? "8 6" : null,
          }).addTo(couche);
        });
      });

      // Arrêts de la ligne (petits points cliquables). Le serveur n'envoie que
      // des identifiants : nom et coordonnées viennent du dictionnaire commun.
      (arretsParLigne[routeId] || []).forEach((stopId) => {
        const arret = arretsInfos[stopId];
        if (!arret) return;
        if (arretsDejaAffiches.has(stopId)) return; // évite les doublons si desservi par plusieurs lignes actives
        arretsDejaAffiches.add(stopId);

        const point = L.circleMarker([arret.lat, arret.lon], {
          radius: 5,
          weight: 2,
          color: "#fff",
          fillColor: "#123A4C",
          fillOpacity: estLigneAttenuee ? 0.15 : 1,
        }).addTo(couche);

        // Un tap sur une pastille d'arrêt ouvre la fiche d'arrêt complète
        // (prochains passages temps réel, favori, partage, horaires théoriques,
        // création d'alerte) plutôt qu'une bulle Leaflet réduite.
        point.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onOuvrirArretRef.current?.({
            stopId,
            nom: arret.nom,
            lat: arret.lat,
            lon: arret.lon,
          });
        });
      });
    });
  }, [traces, arretsParLigne, arretsInfos, lignesInfo, lignesActives, ligneSelectionnee]);

  return <div ref={conteneurRef} className="fixed inset-0" />;
}