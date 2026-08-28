import { formaterRetard } from "../utils.js";

// Repère de la jauge : au-delà, l'attente est trop longue pour qu'une barre de
// progression veuille dire quelque chose. En deçà, elle se remplit à mesure que
// le bus approche et le trait marque le moment où l'alerte sonnera.
const MINUTES_JAUGE = 15;

function Pastille({ couleur, nom }) {
  return (
    <span
      className="shrink-0 min-w-[28px] h-[28px] px-1.5 rounded-full flex items-center justify-center text-[13px] font-bold text-white font-signage"
      style={{ background: couleur }}
    >
      {nom}
    </span>
  );
}

export default function BandeauSuivi({ suivi, couleurLigne, seuil = 5, onArreter }) {
  if (!suivi) return null;

  const imminent = suivi.statut === "imminent";
  // « attente » et « recherche » n'ont pas de bus à décrire : seul un texte.
  const attente = !imminent && suivi.statut !== "suivi";

  const progression = attente ? 0 : Math.min(1, Math.max(0, 1 - suivi.eta / MINUTES_JAUGE));
  const repereSeuil = Math.min(1, Math.max(0, 1 - seuil / MINUTES_JAUGE));
  const enRetard = suivi.retard !== null && suivi.retard !== undefined && suivi.retard > 60;

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "fixed left-0 right-0 bottom-0 z-[1080] rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.25)] overflow-hidden " +
        (imminent
          ? "bg-[var(--amber-500)] text-[var(--chrome-950)] animate-alerte"
          : "bg-[var(--chrome-950)] text-white")
      }
      style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}
    >
      {/* Jauge d'approche : posée sur le bord supérieur, elle se lit d'un coup
          d'œil sans coûter de hauteur. Le trait clair marque le seuil choisi. */}
      {!imminent && (
        <div className="relative h-[3px] bg-white/15">
          <div
            className="h-full bg-[var(--amber-500)] transition-[width] duration-700 ease-out"
            style={{ width: `${progression * 100}%` }}
          />
          {!attente && (
            <span
              aria-hidden="true"
              className="absolute top-0 h-full w-[2px] bg-white/60"
              style={{ left: `${repereSeuil * 100}%` }}
            />
          )}
        </div>
      )}

      <div className="px-4 pt-3 pb-3 flex items-center gap-3">
        {attente ? (
          <span className="shrink-0 ml-1 mr-0.5 w-[9px] h-[9px] rounded-full bg-[var(--amber-500)] animate-pouls" />
        ) : imminent ? (
          <span className="shrink-0 text-2xl leading-none animate-sonnerie">🔔</span>
        ) : (
          <Pastille couleur={couleurLigne || "var(--chrome-700)"} nom={suivi.ligneNom} />
        )}

        <div className="flex-1 min-w-0">
          {attente ? (
            <span className="text-[13.5px] text-white/85">{suivi.texte}</span>
          ) : (
            <>
              {imminent ? (
                <div className="text-[10.5px] font-bold uppercase tracking-[.08em] opacity-70">
                  Ton bus arrive · ligne {suivi.ligneNom}
                </div>
              ) : null}
              <div className="text-[14px] font-semibold truncate">{suivi.arretNom}</div>
              {!imminent && (
                <div className="flex items-center gap-1.5 text-[12px] text-white/70 mt-0.5 flex-wrap">
                  {suivi.horairePrevu && <span>Prévu à {suivi.horairePrevu}</span>}
                  {suivi.retard !== null && suivi.retard !== undefined && (
                    <>
                      {suivi.horairePrevu && <span aria-hidden="true">·</span>}
                      <span className={enRetard ? "text-[var(--amber-500)] font-semibold" : ""}>
                        {formaterRetard(suivi.retard)}
                      </span>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {!attente && (
          <div className="shrink-0 text-right leading-none">
            <span className="font-signage text-2xl font-bold tabular-nums">{suivi.eta}</span>
            <span className="text-[11px] font-normal ml-0.5">min</span>
          </div>
        )}

        <button
          onClick={onArreter}
          aria-label="Arrêter le suivi"
          className={
            "shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm leading-none " +
            (imminent ? "bg-black/10" : "bg-white/15")
          }
        >
          ✕
        </button>
      </div>
    </div>
  );
}
