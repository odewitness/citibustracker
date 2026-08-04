import { useEffect, useRef } from "react";
import L from "leaflet";

// Icône de bus : pastille colorée avec le nom de la ligne, + flèche de cap si connue
function creerIconeBus(couleur, texte, cap) {
  const fleche =
    cap !== null && cap !== undefined
      ? `<div class="bus-cap" style="transform:translateX(-50%) rotate(${cap}deg);"></div>`
      : "";
  return L.divIcon({
    html: `<div style="position:relative;">${fleche}
      <div style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);
      background:${couleur};">${texte}</div></div>`,
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
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
    const cls = bus.retard > 30 ? "retard-neg" : bus.retard < -30 ? "retard-pos" : "";
    const mots =
      bus.retard > 0
        ? `${Math.round(bus.retard / 6) / 10} min de retard`
        : bus.retard < 0
        ? `${Math.round(-bus.retard / 6) / 10} min d'avance`
        : "à l'heure";
    texteRetard = `<div class="${cls}">${mots}</div>`;
  }
  return `<div class="popup-bus"><b>Ligne ${info.nom} — Bus ${bus.label}</b>
    ${texteDestination}
    <div>Vitesse : ${bus.vitesse} km/h</div>
    <div>${texteArret}</div>${texteRetard}</div>`;
}

export default function CarteBus({ vehicules, lignesInfo, lignesActives, direction, mapApiRef }) {
  const conteneurRef = useRef(null);
  const carteRef = useRef(null);
  const couchesBusRef = useRef(null);
  const marqueurMoiRef = useRef(null);
  const premierChargementRef = useRef(true);

  // Initialisation de la carte (une seule fois)
  useEffect(() => {
    const carte = L.map(conteneurRef.current, { zoomControl: false }).setView([43.18, 3.0], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(carte);
    couchesBusRef.current = L.layerGroup().addTo(carte);
    carteRef.current = carte;

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

      const icone = creerIconeBus(info.couleur, info.nom, bus.cap);
      const marker = L.marker([bus.lat, bus.lon], { icon: icone }).bindPopup(
        construirePopup(bus, info)
      );
      couche.addLayer(marker);
      bounds.push([bus.lat, bus.lon]);
    });

    if (premierChargementRef.current && bounds.length > 0) {
      carteRef.current.fitBounds(bounds, { maxZoom: 15, padding: [40, 100] });
      premierChargementRef.current = false;
    }
  }, [vehicules, lignesInfo, lignesActives, direction]);

  return <div ref={conteneurRef} className="fixed inset-0" />;
}