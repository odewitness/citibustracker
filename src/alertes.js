// Alertes programmées : plusieurs alertes mémorisées que l'utilisateur peut
// réarmer d'un geste, certaines récurrentes (« tous les jours ouvrés à 7h50 »).
// Le suivi en avant-plan ne porte que sur UNE alerte active à la fois ; les
// autres restent des modèles prêts à réactiver (et surveillés par le serveur
// quand les notifications push sont configurées).
import { useCallback, useEffect, useState } from "react";
import { ecrireStockage, lireStockage } from "./utils.js";

const CLE = "citibus:alertes-programmees";
const abonnes = new Set();

function lire() {
  const brut = lireStockage(CLE);
  return Array.isArray(brut) ? brut : [];
}

function ecrire(liste) {
  ecrireStockage(CLE, liste);
  abonnes.forEach((fn) => fn(liste));
}

// Deux alertes qui visent le même arrêt, la même ligne, le même sens et le même
// type sont considérées identiques : réenregistrer met à jour au lieu d'empiler.
export function idAlerte(a) {
  return [a.type || "approche", a.routeId, a.direction ?? "", a.stopId].join("|");
}

function tamponMinute(maintenant) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${maintenant.getFullYear()}-${p(maintenant.getMonth() + 1)}-${p(maintenant.getDate())} ` +
    `${p(maintenant.getHours())}:${p(maintenant.getMinutes())}`
  );
}

export function useAlertesProgrammees() {
  const [liste, setListe] = useState(lire);

  useEffect(() => {
    abonnes.add(setListe);
    return () => {
      abonnes.delete(setListe);
    };
  }, []);

  const enregistrer = useCallback((alerte) => {
    const courante = lire();
    const id = alerte.id || idAlerte(alerte);
    ecrire([...courante.filter((a) => a.id !== id), { ...alerte, id }]);
    return id;
  }, []);

  const supprimer = useCallback((id) => {
    ecrire(lire().filter((a) => a.id !== id));
  }, []);

  const definirRecurrence = useCallback((id, recurrence) => {
    ecrire(lire().map((a) => (a.id === id ? { ...a, recurrence } : a)));
  }, []);

  return { liste, enregistrer, supprimer, definirRecurrence };
}

// Première alerte programmée dont la récurrence tombe à cette minute précise
// (jour de la semaine + heure) et qui n'a pas déjà été déclenchée dans la
// minute courante. maintenant est injectable pour les tests.
export function alerteRecurrenteADeclencher(liste, maintenant = new Date()) {
  const jour = maintenant.getDay(); // 0 = dimanche … 6 = samedi
  const p = (n) => String(n).padStart(2, "0");
  const heure = `${p(maintenant.getHours())}:${p(maintenant.getMinutes())}`;
  const tampon = tamponMinute(maintenant);

  return (
    liste.find((a) => {
      const r = a.recurrence;
      if (!r || !Array.isArray(r.jours) || !r.jours.includes(jour)) return false;
      if (r.heure !== heure) return false;
      return r.derniereExecution !== tampon;
    }) || null
  );
}

export function marquerRecurrenceDeclenchee(id, maintenant = new Date()) {
  const tampon = tamponMinute(maintenant);
  ecrire(
    lire().map((a) =>
      a.id === id && a.recurrence
        ? { ...a, recurrence: { ...a.recurrence, derniereExecution: tampon } }
        : a
    )
  );
}
