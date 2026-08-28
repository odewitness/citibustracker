import { useEffect, useState } from "react";

// Fiche horaire théorique d'un arrêt (d'après le GTFS statique) : les prochains
// passages prévus au calendrier, même quand aucun bus ne circule. Chargée à la
// demande depuis la fonction horaires-arret.
export default function HorairesTheoriques({ stopId, lignesInfo = {} }) {
  // L'état retient l'arrêt auquel il correspond : tant qu'il ne coïncide pas
  // avec stopId, on affiche « chargement » sans avoir à réinitialiser dans
  // le corps de l'effet.
  const [etat, setEtat] = useState({ stopId: null, statut: "chargement", passages: [] });

  useEffect(() => {
    let annule = false;
    fetch(`/.netlify/functions/horaires-arret?arret=${encodeURIComponent(stopId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (annule) return;
        setEtat({
          stopId,
          statut: d.erreur ? "erreur" : "ok",
          passages: d.erreur ? [] : d.passages || [],
        });
      })
      .catch(() => {
        if (!annule) setEtat({ stopId, statut: "erreur", passages: [] });
      });
    return () => {
      annule = true;
    };
  }, [stopId]);

  const pret = etat.stopId === stopId;

  if (!pret || etat.statut === "chargement") {
    return <p className="text-[12px] text-[var(--ink-muted)] py-2">Chargement des horaires…</p>;
  }
  if (etat.statut === "erreur") {
    return (
      <p className="text-[12px] text-[var(--ink-muted)] py-2">Horaires théoriques indisponibles.</p>
    );
  }
  if (etat.passages.length === 0) {
    return (
      <p className="text-[12px] text-[var(--ink-muted)] py-2">
        Aucun passage prévu au calendrier dans les prochaines heures.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {etat.passages.map((p, i) => {
        const info = lignesInfo[p.routeId] || {
          nom: p.ligne,
          couleur: p.couleur || "var(--chrome-800)",
        };
        return (
          <div
            key={i}
            className="flex items-center gap-2.5 py-1.5 border-b border-[var(--line)] last:border-0"
          >
            <span
              className="shrink-0 rounded-full px-2 py-[1px] text-[11px] font-bold text-white font-signage"
              style={{ background: info.couleur || p.couleur || "var(--chrome-800)" }}
            >
              {info.nom}
            </span>
            <span className="flex-1 min-w-0 truncate text-[12.5px]">{p.destination || "—"}</span>
            <span className="shrink-0 tabular-nums text-[12.5px] font-semibold">
              {p.heure}
              {p.dans <= 60 && (
                <span className="text-[10.5px] font-normal text-[var(--ink-muted)] ml-1">
                  dans {p.dans} min
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
