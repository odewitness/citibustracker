// Favoris (arrêts + lignes), stockés localement. Un mini-bus d'événements
// permet à plusieurs composants (panneau favoris, liste d'arrêts, île de
// statut) de rester synchronisés sans remonter l'état jusqu'à App.
import { useCallback, useEffect, useState } from "react";
import { ecrireStockage, lireStockage } from "./utils.js";

const CLE = "citibus:favoris";
const abonnes = new Set();

function lire() {
  const brut = lireStockage(CLE) || {};
  return {
    arrets: Array.isArray(brut.arrets) ? brut.arrets : [],
    lignes: Array.isArray(brut.lignes) ? brut.lignes : [],
  };
}

function ecrire(valeur) {
  ecrireStockage(CLE, valeur);
  abonnes.forEach((fn) => fn(valeur));
}

function basculer(liste, valeur) {
  return liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur];
}

export function useFavoris() {
  const [favoris, setFavoris] = useState(lire);

  useEffect(() => {
    abonnes.add(setFavoris);
    return () => {
      abonnes.delete(setFavoris);
    };
  }, []);

  const basculerArret = useCallback((stopId) => {
    const f = lire();
    ecrire({ ...f, arrets: basculer(f.arrets, stopId) });
  }, []);

  const basculerLigne = useCallback((routeId) => {
    const f = lire();
    ecrire({ ...f, lignes: basculer(f.lignes, routeId) });
  }, []);

  return { favoris, basculerArret, basculerLigne };
}
