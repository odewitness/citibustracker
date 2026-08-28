import { prochainsPassages } from "../utils.js";
import { useFavoris } from "../favoris.js";
import EtoileFavori from "./EtoileFavori.jsx";

// Accès rapide aux arrêts et lignes mis en favori. Les arrêts affichent leurs
// prochains passages temps réel ; les lignes servent de raccourci d'affichage
// sur la carte.
export default function PanneauFavoris({
  ouvert,
  onFermer,
  arretsInfos,
  lignesInfo,
  vehicules,
  lignesActives,
  onChoisirArret,
  onCreerAlerte,
  onBasculerAffichageLigne,
}) {
  const { favoris, basculerArret, basculerLigne } = useFavoris();

  if (!ouvert) return null;

  const rien = favoris.arrets.length === 0 && favoris.lignes.length === 0;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[1095] flex justify-center px-3"
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl shadow-black/30 flex flex-col max-h-[72vh] overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-[var(--line)]">
          <span className="text-base leading-none text-[var(--amber-500)]">★</span>
          <h2 className="flex-1 text-sm font-bold font-signage">Favoris</h2>
          <button
            onClick={onFermer}
            aria-label="Fermer"
            className="shrink-0 w-7 h-7 rounded-full bg-[var(--line)] text-[var(--ink)] text-sm leading-none"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-2">
          {rien && (
            <p className="text-[13px] text-[var(--ink-muted)] py-4 text-center">
              Aucun favori pour l'instant. Touche l'étoile d'un arrêt ou d'une ligne pour l'ajouter
              ici.
            </p>
          )}

          {favoris.lignes.length > 0 && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)] pt-1 pb-1">
                Lignes
              </p>
              <div className="flex flex-wrap gap-1.5 pb-2">
                {favoris.lignes.map((routeId) => {
                  const info = lignesInfo[routeId] || { nom: routeId, couleur: "var(--chrome-800)" };
                  const affichee = lignesActives?.has(routeId);
                  return (
                    <span key={routeId} className="flex items-center gap-1">
                      <button
                        onClick={() => onBasculerAffichageLigne?.(routeId)}
                        className="rounded-full px-3 py-1 text-[12.5px] font-bold font-signage text-white transition-opacity active:scale-95"
                        style={{ background: info.couleur, opacity: affichee ? 1 : 0.35 }}
                      >
                        {info.nom}
                      </button>
                      <EtoileFavori
                        actif
                        onToggle={() => basculerLigne(routeId)}
                        label={"la ligne " + info.nom}
                      />
                    </span>
                  );
                })}
              </div>
            </>
          )}

          {favoris.arrets.length > 0 && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)] pt-2 pb-0.5">
                Arrêts
              </p>
              {favoris.arrets.map((stopId) => {
                const a = arretsInfos[stopId];
                if (!a) return null;
                const passages = prochainsPassages(stopId, vehicules).slice(0, 3);
                return (
                  <div
                    key={stopId}
                    className="flex items-center gap-2 py-2 border-b border-[var(--line)] last:border-0"
                  >
                    <button
                      onClick={() => onChoisirArret({ stopId, lat: a.lat, lon: a.lon, nom: a.nom })}
                      className="flex-1 min-w-0 text-left active:opacity-70"
                    >
                      <div className="text-[13.5px] font-semibold truncate">{a.nom}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {passages.length === 0 ? (
                          <span className="text-[11.5px] text-[var(--ink-muted)]">
                            Aucun passage prévu
                          </span>
                        ) : (
                          passages.map((p, i) => {
                            const info = lignesInfo[p.ligne] || {
                              nom: p.ligne,
                              couleur: "var(--chrome-800)",
                            };
                            return (
                              <span key={i} className="flex items-center gap-1">
                                <span
                                  className="rounded-full px-2 py-[1px] text-[11px] font-bold text-white font-signage"
                                  style={{ background: info.couleur }}
                                >
                                  {info.nom}
                                </span>
                                <span className="text-[11.5px] tabular-nums text-[var(--ink-muted)]">
                                  {p.eta} min
                                </span>
                                {p.pmr === true && (
                                  <span title="Accessible UFR" className="text-[11px]">
                                    ♿
                                  </span>
                                )}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </button>
                    {onCreerAlerte && (
                      <button
                        onClick={() => onCreerAlerte(stopId)}
                        aria-label="Créer une alerte sur cet arrêt"
                        className="shrink-0 w-7 h-7 rounded-full bg-[var(--line)] text-[var(--ink)] text-[13px] leading-none"
                      >
                        🔔
                      </button>
                    )}
                    <EtoileFavori
                      actif
                      onToggle={() => basculerArret(stopId)}
                      label={"l'arrêt " + a.nom}
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
