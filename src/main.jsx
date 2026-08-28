import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
// Empaqueté avec l'application plutôt que chargé depuis unpkg : une panne du
// CDN affichait une carte cassée, et c'était une requête bloquante de plus.
import "leaflet/dist/leaflet.css";
import "./index.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // Vérifie activement s'il existe une nouvelle version à chaque ouverture,
        // plutôt que d'attendre le cycle de mise à jour naturel du navigateur.
        registration.update();
      })
      .catch(() => {
        /* pas grave si ça échoue, l'app fonctionne sans */
      });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
