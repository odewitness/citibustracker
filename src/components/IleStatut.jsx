import { useState } from "react";
import { GROUPE_PRINCIPALES, GROUPE_AUTRES } from "../utils.js";

const ONGLETS = [
  { valeur: GROUPE_PRINCIPALES, label: "Lignes 1-4 & Citadines", labelCourt: "1-4 & Cit" },
  { valeur: GROUPE_AUTRES, label: "Autres bus", labelCourt: "Autres" },
];

const DIRECTIONS = [
  ["tous", "Toutes"],
  ["0", "Sens 0"],
  ["1", "Sens 1"],
];

function GrilleIcone() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="w-4 h-4">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" fill="currentColor" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" fill="currentColor" />
    </svg>
  );
}

function Chevron({ ouvert }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={"w-3 h-3 shrink-0 transition-transform duration-200 " + (ouvert ? "rotate-180" : "")}
    >
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function IleStatut({
  statutTexte,
  lignesInfo,
  ids,
  lignesActives,
  onBasculerLigne,
  groupe,
  onChangerGroupe,
  onToutAfficher,
  onToutMasquer,
  direction,
  onChangerDirection,
  onRetourTableau,
  onVoirLigneDetail,
}) {
  // Les filtres sont repliés par défaut : l'encadré ne mange plus la carte,
  // et l'essentiel (nombre de bus + heure de mise à jour) reste toujours visible.
  const [ouvert, setOuvert] = useState(false);

  const nbActives = ids.filter((id) => lignesActives.has(id)).length;
  const toutAffiche = ids.length > 0 && nbActives === ids.length;
  const ongletCourant = ONGLETS.find((o) => o.valeur === groupe) || ONGLETS[0];

  return (
    <div className="fixed top-0 left-0 right-0 z-[1100] flex justify-center px-3 pt-safe pt-3">
      <div className="w-full max-w-md rounded-2xl bg-[var(--chrome-950)]/95 backdrop-blur shadow-lg shadow-black/30 text-white overflow-hidden">
        {/* Barre compacte, toujours visible : retour au tableau de bord,
            statut et accès aux filtres. */}
        <div className="w-full flex items-center h-11">
          {onRetourTableau && (
            <button
              onClick={onRetourTableau}
              aria-label="Revenir au tableau de bord"
              className="shrink-0 h-full pl-3 pr-1.5 flex items-center text-white/90 active:opacity-60"
            >
              <GrilleIcone />
            </button>
          )}
          <button
            onClick={() => setOuvert((o) => !o)}
            aria-expanded={ouvert}
            aria-label={ouvert ? "Masquer les filtres" : "Afficher les filtres"}
            className={
              "flex-1 min-w-0 flex items-center gap-2.5 pr-3.5 h-full text-left " +
              (onRetourTableau ? "pl-1.5" : "pl-3.5")
            }
          >
            <span className="w-[7px] h-[7px] rounded-full bg-[var(--amber-500)] animate-pouls shrink-0" />
            <span className="flex-1 min-w-0 truncate font-signage text-[13px] font-semibold">
              {statutTexte}
            </span>
            <span className="shrink-0 flex items-center gap-1.5 rounded-full bg-white/12 pl-2.5 pr-2 py-1 text-[11.5px] font-semibold">
              {ongletCourant.labelCourt}
              <span className="tabular-nums text-white/70">
                {nbActives}/{ids.length}
              </span>
              <Chevron ouvert={ouvert} />
            </span>
          </button>
        </div>

        {ouvert && (
          <div className="px-3 pb-3 flex flex-col gap-2">
            {/* Onglets : réseau urbain / toutes les autres lignes */}
            <div className="flex gap-1 p-0.5 rounded-full bg-white/10">
              {ONGLETS.map(({ valeur, label }) => (
                <button
                  key={valeur}
                  onClick={() => onChangerGroupe(valeur)}
                  className={
                    "flex-1 rounded-full py-1.5 text-[12px] font-semibold transition-colors " +
                    (groupe === valeur ? "bg-white text-[var(--chrome-950)]" : "text-white/70")
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Lignes de l'onglet : une seule rangée qui défile horizontalement,
                pour que la hauteur de l'encadré ne dépende pas du nombre de lignes. */}
            {ids.length === 0 ? (
              <p className="text-center text-white/60 text-[12px] py-1.5">
                {groupe === GROUPE_AUTRES
                  ? "Aucune autre ligne en circulation"
                  : "Chargement des lignes…"}
              </p>
            ) : (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hidden -mx-0.5 px-0.5 py-0.5">
                {ids.map((routeId) => {
                  const info = lignesInfo[routeId];
                  const actif = lignesActives.has(routeId);
                  return (
                    <button
                      key={routeId}
                      onClick={() => onBasculerLigne(routeId)}
                      aria-pressed={actif}
                      className="shrink-0 rounded-full px-3 py-1 text-[12.5px] font-bold font-signage text-white transition-opacity active:scale-95"
                      style={{ background: info.couleur, opacity: actif ? 1 : 0.3 }}
                    >
                      {info.nom}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Sens de circulation + bascule globale des lignes */}
            <div className="flex items-center gap-1.5">
              <div className="flex flex-1 gap-0.5 p-0.5 rounded-full bg-white/10">
                {DIRECTIONS.map(([valeur, label]) => (
                  <button
                    key={valeur}
                    onClick={() => onChangerDirection(valeur)}
                    className={
                      "flex-1 rounded-full py-1 text-[11.5px] transition-colors " +
                      (direction === valeur
                        ? "bg-white text-[var(--chrome-950)] font-semibold"
                        : "text-white/70")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              {ids.length > 1 && (
                <button
                  onClick={toutAffiche ? onToutMasquer : onToutAfficher}
                  className="shrink-0 rounded-full px-3 py-[5px] text-[11.5px] border border-white/30 text-white/85"
                >
                  {toutAffiche ? "Tout masquer" : "Tout afficher"}
                </button>
              )}
            </div>

            {onVoirLigneDetail && ids.length > 0 && (
              <button
                onClick={onVoirLigneDetail}
                className="w-full rounded-full py-1.5 text-[11.5px] font-semibold bg-white/12 text-white/90 active:bg-white/20"
              >
                Voir une ligne en direct
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
