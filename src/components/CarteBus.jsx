import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { formaterRetard } from "../utils.js";

// Icône de bus : pastille colorée, numéro de ligne, flèche de cap si connue.
// - direction : "0"/"1" → bordure pleine ou pointillée, pour distinguer les sens
//   d'un coup d'œil sans avoir à sélectionner un bus.
// - etat : "normal" | "selectionne" | "attenue" → mis en évidence / estompé
//   quand l'utilisateur a tapé sur un bus précis pour le suivre parmi d'autres
//   de la même ligne.
function creerIconeBus(couleur, texte, cap, direction, etat) {
  const taille = etat === "selectionne" ? 38 : 30;
  const bordure = String(direction) === "1" ? "3px dashed #fff" : "2px solid #fff";
  const anneau =
    etat === "selectionne"
      ? "box-shadow:0 0 0 3px var(--amber-500), 0 2px 10px rgba(0,0,0,.45);"
      : "box-shadow:0 2px 6px rgba(0,0,0,.35);";
  const opacite = etat === "attenue" ? 0.25 : 1;
  const fleche =
    cap !== null && cap !== undefined
      ? `<div class="bus-cap" style="transform:translateX(-50%) rotate(${cap}deg);"></div>`
      : "";
  return L.divIcon({
    html: `<div style="position:relative;opacity:${opacite};">${fleche}
      <div style="width:${taille}px;height:${taille}px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:${etat === "selectionne" ? 13 : 11}px;font-weight:700;border:${bordure};${anneau}
      background:${couleur};">${texte}</div></div>`,
    className: "",
    iconSize: [taille, taille],
    iconAnchor: [taille / 2, taille / 2],
    popupAnchor: [0, -taille / 2],
  });
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
  return `<div class="popup-bus"><b>Ligne ${info.nom} — Bus ${bus.label}</b>
    ${texteDestination}
    <div>Vitesse : ${bus.vitesse} km/h</div>
    <div>${texteArret}</div>${texteRetard}</div>`;
}

// Construit le contenu du "tableau des prochains passages" pour un arrêt donné,
// à partir des données de bus les plus récentes (calculé à l'ouverture du popup,
// pas au moment où le marqueur a été créé, pour rester à jour).
function construireContenuArret(nomArret, stopId, vehicules, lignesInfo) {
  const passages = [];
  (vehicules || []).forEach((v) => {
    (v.prochains_arrets || []).forEach((a) => {
      if (a.stop_id !== stopId || !a.arrivee) return;
      const etaMinutes = (a.arrivee * 1000 - Date.now()) / 60000;
      if (etaMinutes < -1) return;
      passages.push({ v, a, eta: Math.max(0, Math.round(etaMinutes)) });
    });
  });
  passages.sort((x, y) => x.eta - y.eta);

  if (passages.length === 0) {
    return `<div class="popup-bus"><b>${nomArret}</b><div style="margin-top:6px;color:#5B6B72;">Aucun bus prévu pour le moment</div></div>`;
  }

  const lignesHtml = passages
    .slice(0, 5)
    .map(({ v, a, eta }) => {
      const info = lignesInfo[v.ligne] || { nom: v.ligne, couleur: "#0F2E3D" };
      const dest = v.destination ? ` → ${v.destination}` : "";
      const retard =
        a.retard !== null && a.retard !== undefined ? ` · ${formaterRetard(a.retard)}` : "";
      return `<div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <span style="background:${info.couleur};color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:999px;">${info.nom}</span>
        <span style="flex:1;font-size:12.5px;">${dest}${retard}</span>
        <span style="font-weight:700;font-size:13px;">${eta} min</span>
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

  // Bus actuellement isolé par l'utilisateur (tap-to-focus), pour le distinguer
  // des autres bus de la même ligne. null = aucune sélection, affichage normal.
  const [busSelectionneId, setBusSelectionneId] = useState(null);

  useEffect(() => { vehiculesRef.current = vehicules; }, [vehicules]);
  useEffect(() => { lignesInfoRef.current = lignesInfo; }, [lignesInfo]);

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

  // Redessine les marqueurs de bus à chaque nouvelle donnée / changement de filtre
  useEffect(() => {
    const couche = couchesBusRef.current;
    if (!couche) return;
    couche.clearLayers();

    const bounds = [];
    vehicules.forEach((bus) => {
      if (!lignesActives.has(String(bus.ligne))) return;
      if (direction !== "tous" && String(bus.direction) !== direction) return;
      const info = lignesInfo[bus.ligne];
      if (!info) return;

      let etat = "normal";
      if (busSelectionneId) {
        etat = bus.id === busSelectionneId ? "selectionne" : "attenue";
      }

      const icone = creerIconeBus(info.couleur, info.nom, bus.cap, bus.direction, etat);
      const marker = L.marker([bus.lat, bus.lon], { icon: icone }).bindPopup(
        construirePopup(bus, info)
      );
      marker.on("click", () => {
        setBusSelectionneId((precedent) => (precedent === bus.id ? null : bus.id));
      });
      couche.addLayer(marker);
      bounds.push([bus.lat, bus.lon]);
    });

    if (premierChargementRef.current && bounds.length > 0) {
      carteRef.current.fitBounds(bounds, { maxZoom: 15, padding: [40, 100] });
      premierChargementRef.current = false;
    }
  }, [vehicules, lignesInfo, lignesActives, direction, busSelectionneId]);

  // Redessine les tracés de lignes + arrêts cliquables — quand la sélection de
  // lignes change, ou quand la ligne du bus mis en avant change (mais PAS à
  // chaque poll de 15s : ligneSelectionnee est une simple chaîne stable tant
  // que le même bus reste sélectionné, donc pas de redessin inutile).
  useEffect(() => {
    const couche = couchesReseauRef.current;
    if (!couche || !traces || !arretsParLigne) return;
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

      // Arrêts de la ligne (petits points cliquables)
      (arretsParLigne[routeId] || []).forEach((arret) => {
        if (arretsDejaAffiches.has(arret.stop_id)) return; // évite les doublons si desservi par plusieurs lignes actives
        arretsDejaAffiches.add(arret.stop_id);

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
              construireContenuArret(arret.nom, arret.stop_id, vehiculesRef.current, lignesInfoRef.current)
            );
        });
      });
    });
  }, [traces, arretsParLigne, lignesInfo, lignesActives, ligneSelectionnee]);

  return (
    <>
      <div ref={conteneurRef} className="fixed inset-0" />
      {busSelectionne && (
        <div className="fixed top-[190px] left-1/2 -translate-x-1/2 z-[1070] bg-white rounded-full shadow-lg px-4 py-2 flex items-center gap-2 text-[13px]">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: lignesInfo[busSelectionne.ligne]?.couleur || "#0F2E3D" }}
          />
          <span className="font-medium">
            Bus {busSelectionne.label} isolé{busSelectionne.destination ? " → " + busSelectionne.destination : ""}
          </span>
          <button
            onClick={() => setBusSelectionneId(null)}
            className="ml-1 w-5 h-5 rounded-full bg-[var(--line)] flex items-center justify-center text-[11px] leading-none"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
