import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import {
  agePosition,
  busFantome,
  categorieRetard,
  COULEUR_RETARD,
  formaterAge,
  formaterRetard,
  prochainsPassages,
} from "../utils.js";

// Icône de bus : pastille colorée, numéro de ligne, flèche de cap si connue.
// - direction : "0"/"1" → bordure pleine ou pointillée, pour distinguer les sens
//   d'un coup d'œil sans avoir à sélectionner un bus.
// - etat : "normal" | "selectionne" | "attenue" → mis en évidence / estompé
//   quand l'utilisateur a tapé sur un bus précis pour le suivre parmi d'autres
//   de la même ligne.
function creerIconeBus(couleur, texte, cap, direction, etat, retardCat = "inconnu", fantome = false) {
  const taille = etat === "selectionne" ? 38 : 30;
  const bordure = String(direction) === "1" ? "3px dashed #fff" : "2px solid #fff";
  // Anneau de ponctualité (vert à l'heure, ambre / rouge en retard, bleu en
  // avance) — sauf sur le bus sélectionné, dont l'anneau ambre prime.
  const couleurAnneau = COULEUR_RETARD[retardCat];
  const anneau =
    etat === "selectionne"
      ? "box-shadow:0 0 0 3px var(--amber-500), 0 2px 10px rgba(0,0,0,.45);"
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

function construirePopup(bus, info) {
  const texteArret = bus.prochain_arret
    ? `Prochain arrêt : ${bus.prochain_arret}`
    : "Horaires non disponibles";
  const texteDestination = bus.destination
    ? `<div class="destination">→ ${bus.destination}</div>`
    : "";
  let texteRetard = "";
  if (bus.retard !== null && bus.retard !== undefined) {
    const cls = bus.retard > 60 ? "retard-neg" : bus.retard < -60 ? "retard-pos" : "";
    texteRetard = `<div class="${cls}">${formaterRetard(bus.retard)}</div>`;
  }
  // Bus dont la position n'a pas été rafraîchie depuis plusieurs minutes :
  // on le signale explicitement pour ne pas faire attendre à un arrêt.
  const age = agePosition(bus);
  const texteFantome = busFantome(bus)
    ? `<div class="fantome">⚠ Position figée depuis ${formaterAge(age)}</div>`
    : "";
  return `<div class="popup-bus"><b>Ligne ${info.nom} — Bus ${bus.label}</b>
    ${texteDestination}
    <div>Vitesse : ${bus.vitesse} km/h</div>
    <div>${texteArret}</div>${texteRetard}${texteFantome}</div>`;
}

// Construit le contenu du "tableau des prochains passages" pour un arrêt donné,
// à partir des données de bus les plus récentes (calculé à l'ouverture du popup,
// pas au moment où le marqueur a été créé, pour rester à jour).
function construireContenuArret(nomArret, stopId, vehicules, lignesInfo) {
  const passages = prochainsPassages(stopId, vehicules);

  if (passages.length === 0) {
    return `<div class="popup-bus"><b>${nomArret}</b><div style="margin-top:6px;color:#5B6B72;">Aucun bus prévu pour le moment</div></div>`;
  }

  const lignesHtml = passages
    .slice(0, 5)
    .map((p) => {
      const info = lignesInfo[p.ligne] || { nom: p.ligne, couleur: "#0F2E3D" };
      const dest = p.destination ? ` → ${p.destination}` : "";
      const retard =
        p.retard !== null && p.retard !== undefined ? ` · ${formaterRetard(p.retard)}` : "";
      return `<div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <span style="background:${info.couleur};color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:999px;">${info.nom}</span>
        <span style="flex:1;font-size:12.5px;">${dest}${retard}</span>
        <span style="font-weight:700;font-size:13px;">${p.eta} min</span>
      </div>`;
    })
    .join("");

  return `<div class="popup-bus"><b>${nomArret}</b>${lignesHtml}</div>`;
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
}) {
  const conteneurRef = useRef(null);
  const carteRef = useRef(null);
  const couchesBusRef = useRef(null);
  const couchesReseauRef = useRef(null);
  const marqueurMoiRef = useRef(null);
  const premierChargementRef = useRef(true);
  const vehiculesRef = useRef(vehicules);
  const lignesInfoRef = useRef(lignesInfo);
  // Marqueurs de bus actuellement sur la carte, indexés par id de véhicule.
  // C'est la pièce maîtresse du rafraîchissement : on déplace et on met à jour
  // ces marqueurs plutôt que de vider la couche, car un clearLayers() détruirait
  // le marqueur cliqué et refermerait son popup — à la sélection comme à chaque
  // relevé de 15 s.
  const marqueursRef = useRef(new Map());

  // Bus actuellement isolé par l'utilisateur (tap-to-focus), pour le distinguer
  // des autres bus de la même ligne. null = aucune sélection, affichage normal.
  const [busSelectionneId, setBusSelectionneId] = useState(null);
  const busSelectionneIdRef = useRef(null);

  useEffect(() => { vehiculesRef.current = vehicules; }, [vehicules]);
  useEffect(() => { lignesInfoRef.current = lignesInfo; }, [lignesInfo]);
  useEffect(() => { busSelectionneIdRef.current = busSelectionneId; }, [busSelectionneId]);

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
    carte.on("click", () => setBusSelectionneId(null));

    // On expose quelques méthodes utiles au composant parent (recentrage, suivi)
    if (mapApiRef) {
      mapApiRef.current = {
        centrerSur(lat, lon, zoomMin) {
          const zoom = zoomMin ? Math.max(carte.getZoom(), zoomMin) : carte.getZoom();
          carte.setView([lat, lon], zoom);
        },
        suivre(lat, lon) {
          carte.panTo([lat, lon], { animate: true });
          if (carte.getZoom() < 15) carte.setZoom(15);
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

    const selectionActuelle = busSelectionneIdRef.current;
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

      let etat = "normal";
      if (selectionActuelle) {
        etat = bus.id === selectionActuelle ? "selectionne" : "attenue";
      }

      const existant = marqueursRef.current.get(bus.id);
      if (existant) {
        existant.bus = bus;
        existant.info = info;
        existant.marker.setLatLng([bus.lat, bus.lon]);
        appliquerIcone(existant, etat);
        // Rafraîchit aussi le contenu : un popup resté ouvert affiche désormais
        // le prochain arrêt et le retard à jour, sans se refermer.
        existant.marker.setPopupContent(construirePopup(bus, info));
        return;
      }

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
      }).bindPopup(construirePopup(bus, info));
      marker.on("click", () => {
        setBusSelectionneId((precedent) => (precedent === bus.id ? null : bus.id));
      });
      couche.addLayer(marker);
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
  }, [vehicules, lignesInfo, lignesActives, direction]);

  // Met à jour l'icône des marqueurs déjà présents quand la sélection change
  // (clic sur un bus / désélection), sans toucher à la couche ni aux popups :
  // c'est ce qui permet au popup du bus cliqué de rester ouvert.
  useEffect(() => {
    marqueursRef.current.forEach((entree) => {
      let etat = "normal";
      if (busSelectionneId) {
        etat = entree.bus.id === busSelectionneId ? "selectionne" : "attenue";
      }
      appliquerIcone(entree, etat);
    });
  }, [busSelectionneId]);

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

        point.bindPopup("");
        point.on("popupopen", () => {
          point
            .getPopup()
            .setContent(
              construireContenuArret(arret.nom, stopId, vehiculesRef.current, lignesInfoRef.current)
            );
        });
      });
    });
  }, [traces, arretsParLigne, arretsInfos, lignesInfo, lignesActives, ligneSelectionnee]);

  return <div ref={conteneurRef} className="fixed inset-0" />;
}