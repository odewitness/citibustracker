import { useMemo, useState } from "react";
import { ecrireStockage, lireStockage } from "../utils.js";

const CLE_VUES = "citibus:alertes-vues";

// Bandeau d'information trafic (déviations, arrêts non desservis, lignes
// suspendues) issu des Service Alerts du flux GTFS-RT. Replié par défaut :
// une pastille compacte sous l'île de statut, dépliable au tap.
export default function BandeauAlertes({ alertes = [], lignesInfo = {}, onVoirLigne }) {
  const [ouvert, setOuvert] = useState(false);
  const [vues, setVues] = useState(() => new Set(lireStockage(CLE_VUES) || []));

  const visibles = useMemo(
    () => alertes.filter((a) => !vues.has(a.id)),
    [alertes, vues]
  );

  if (visibles.length === 0) return null;

  function ignorer(id) {
    const suivant = new Set(vues);
    suivant.add(id);
    setVues(suivant);
    ecrireStockage(CLE_VUES, Array.from(suivant));
  }

  const nom = (routeId) => lignesInfo[routeId]?.nom || routeId;
  const couleur = (routeId) => lignesInfo[routeId]?.couleur || "var(--chrome-800)";

  return (
    <div
      className="fixed left-0 right-0 z-[1090] flex justify-center px-3"
      style={{ top: "calc(env(safe-area-inset-top) + 66px)" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-[var(--danger)] text-white shadow-lg shadow-black/30 overflow-hidden">
        <button
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left"
        >
          <span className="shrink-0 text-base leading-none">⚠️</span>
          <span className="flex-1 min-w-0 truncate text-[12.5px] font-semibold">
            {visibles.length === 1
              ? visibles[0].titre
              : `${visibles.length} infos trafic en cours`}
          </span>
          <span className="shrink-0 text-[11px] opacity-80">{ouvert ? "Masquer" : "Voir"}</span>
        </button>

        {ouvert && (
          <div className="px-3.5 pb-3 pt-0.5 flex flex-col gap-2.5 max-h-[46vh] overflow-y-auto">
            {visibles.map((a) => (
              <div key={a.id} className="rounded-xl bg-white/12 p-2.5">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      {a.effet && (
                        <span className="rounded-full bg-white/25 px-2 py-[1px] text-[10.5px] font-bold uppercase tracking-wide">
                          {a.effet}
                        </span>
                      )}
                      {a.lignes.map((routeId) =>
                        onVoirLigne ? (
                          <button
                            key={routeId}
                            onClick={() => onVoirLigne(routeId)}
                            className="rounded-full px-2 py-[1px] text-[10.5px] font-bold font-signage active:scale-95"
                            style={{ background: couleur(routeId) }}
                          >
                            {nom(routeId)}
                          </button>
                        ) : (
                          <span
                            key={routeId}
                            className="rounded-full px-2 py-[1px] text-[10.5px] font-bold font-signage"
                            style={{ background: couleur(routeId) }}
                          >
                            {nom(routeId)}
                          </span>
                        )
                      )}
                    </div>
                    <div className="text-[12.5px] font-semibold leading-snug">{a.titre}</div>
                    {a.description && (
                      <div className="text-[11.5px] leading-snug opacity-90 mt-0.5 whitespace-pre-line">
                        {a.description}
                      </div>
                    )}
                    {a.arrets.length > 0 && (
                      <div className="text-[11px] opacity-80 mt-1">
                        Arrêts : {a.arrets.map((s) => s.nom).join(", ")}
                      </div>
                    )}
                    {a.url && (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-[11.5px] underline mt-1"
                      >
                        En savoir plus
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => ignorer(a.id)}
                    aria-label="Ignorer cette alerte"
                    className="shrink-0 w-6 h-6 rounded-full bg-white/20 text-white text-xs leading-none"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
