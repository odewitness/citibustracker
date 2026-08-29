import { useEffect, useMemo, useState } from "react";
import {
  agePosition,
  COULEUR_OCCUPATION,
  etatPosition,
  formaterAge,
  formaterRetard,
  LIBELLE_OCCUPATION,
} from "../utils.js";

// Fiche « trajet complet » d'un bus : ouverte quand l'utilisateur touche un
// véhicule sur la carte. Reprend les prochains arrêts déjà calculés côté serveur
// (bus.prochains_arrets) et les présente en frise, avec l'heure prévue, le
// retard et le temps restant arrêt par arrêt.
export default function FicheBus({ bus, lignesInfo = {}, onFermer, onChoisirArret }) {
  const info = bus ? lignesInfo[bus.ligne] || { nom: bus.ligne, couleur: "var(--chrome-800)" } : null;

  // L'horloge vit dans un effet (pas d'appel impur pendant le rendu) et se
  // rafraîchit chaque demi-minute pour que les « dans N min » restent justes
  // même si le flux ne bouge pas.
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const etapes = useMemo(() => {
    if (!bus) return [];
    return (bus.prochains_arrets || [])
      .filter((a) => a.stop_id)
      .map((a) => {
        const eta = a.arrivee != null ? Math.round((a.arrivee * 1000 - maintenant) / 60000) : null;
        return { ...a, eta };
      })
      .filter((a) => a.eta === null || a.eta >= -1);
  }, [bus, maintenant]);

  if (!bus || !info) return null;

  const occ = bus.occupation;
  const etat = etatPosition(bus, maintenant);
  const etatTexte =
    etat === "ancienne"
      ? `Position vieille de ${formaterAge(agePosition(bus, maintenant))}`
      : etat === "signal-perdu"
        ? `Signal perdu depuis ${formaterAge(agePosition(bus, maintenant))}`
        : etat === "hors-service"
          ? "Hors service (position figée)"
          : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Trajet de la ligne ${info.nom}${bus.destination ? " vers " + bus.destination : ""}`}
      className="fixed inset-x-0 bottom-0 z-[1095] flex justify-center px-3"
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl shadow-black/30 flex flex-col max-h-[78vh] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--line)]">
          <span
            className="shrink-0 min-w-[30px] h-[26px] px-2 rounded-full flex items-center justify-center text-[13px] font-bold text-white font-signage"
            style={{ background: info.couleur }}
          >
            {info.nom}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold font-signage truncate">
              {bus.destination ? `→ ${bus.destination}` : `Bus ${bus.label}`}
            </h2>
            <div className="text-[11.5px] text-[var(--ink-muted)] flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{bus.vitesse} km/h</span>
              {bus.retard !== null && bus.retard !== undefined && (
                <span className={bus.retard > 60 ? "text-[var(--danger)] font-semibold" : ""}>
                  {formaterRetard(bus.retard)}
                </span>
              )}
              {occ && occ.niveau && (
                <span className="font-semibold" style={{ color: COULEUR_OCCUPATION[occ.niveau] }}>
                  {LIBELLE_OCCUPATION[occ.niveau]}
                  {occ.pct !== null && occ.pct !== undefined ? ` · ${occ.pct} %` : ""}
                </span>
              )}
              {bus.pmr === true && <span>♿ accessible</span>}
              {etatTexte && <span className="text-[var(--danger)]">⚠ {etatTexte}</span>}
            </div>
          </div>
          <button
            onClick={onFermer}
            aria-label="Fermer"
            className="shrink-0 w-7 h-7 rounded-full bg-[var(--line)] text-[var(--ink)] text-sm leading-none"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-2">
          {etapes.length === 0 ? (
            <p className="text-[13px] text-[var(--ink-muted)] py-3">
              Aucun arrêt à venir connu pour ce bus (course peut-être terminée).
            </p>
          ) : (
            etapes.map((a, i) => (
              <button
                key={a.stop_id + "-" + i}
                onClick={() => onChoisirArret?.(a.stop_id)}
                className="w-full flex items-stretch gap-3 py-2 border-b border-[var(--line)] last:border-0 text-left active:opacity-70"
              >
                <span className="relative shrink-0 w-3 flex justify-center">
                  <span className="absolute inset-y-0 w-[2px] bg-[var(--line)]" />
                  <span
                    className={
                      "relative my-auto rounded-full border-2 border-white " +
                      (i === 0
                        ? "w-3 h-3 bg-[var(--amber-500)] ring-2 ring-[var(--amber-500)]"
                        : "w-2.5 h-2.5 bg-[var(--chrome-800)]")
                    }
                  />
                </span>
                <div className="flex-1 min-w-0">
                  <div className={"text-[13.5px] truncate " + (i === 0 ? "font-semibold" : "")}>
                    {a.nom}
                  </div>
                  <div className="text-[11.5px] text-[var(--ink-muted)]">
                    {a.horaire_prevu && <>Prévu à {a.horaire_prevu}</>}
                    {a.retard !== null && a.retard !== undefined && (
                      <> · {formaterRetard(a.retard)}</>
                    )}
                  </div>
                </div>
                <div className="shrink-0 self-center text-right leading-none">
                  {a.eta === null ? (
                    <span className="text-[11.5px] text-[var(--ink-muted)]">—</span>
                  ) : (
                    <>
                      <span className="font-signage font-bold text-[15px] tabular-nums">
                        {Math.max(0, a.eta)}
                      </span>
                      <span className="text-[10.5px] ml-0.5">min</span>
                    </>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
