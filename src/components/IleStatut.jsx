import { GROUPE_PRINCIPALES, GROUPE_AUTRES } from "../utils.js";

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
}) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[1100] flex justify-center px-3 pt-safe pt-3">
      <div className="w-full max-w-md rounded-2xl bg-[var(--chrome-950)]/95 backdrop-blur shadow-lg shadow-black/30 px-4 py-3">
        <div className="flex items-center justify-center gap-2 text-white text-[13px] font-semibold mb-3">
          <span className="w-[7px] h-[7px] rounded-full bg-[var(--amber-500)] animate-pouls shrink-0" />
          <span className="font-signage">{statutTexte}</span>
        </div>

        {/* Onglets : lignes du réseau urbain / toutes les autres lignes */}
        <div className="flex gap-1 p-1 rounded-full bg-white/10 mb-3">
          {[
            [GROUPE_PRINCIPALES, "Lignes 1-4 & Citadines"],
            [GROUPE_AUTRES, "Autres bus"],
          ].map(([valeur, label]) => (
            <button
              key={valeur}
              onClick={() => onChangerGroupe(valeur)}
              className={
                "flex-1 rounded-full py-1.5 text-[12.5px] font-semibold transition-colors " +
                (groupe === valeur
                  ? "bg-white text-[var(--chrome-950)]"
                  : "text-white/75 bg-transparent")
              }
            >
              {label}
            </button>
          ))}
        </div>

        {ids.length === 0 ? (
          <div className="text-center text-white/70 text-[12.5px] py-1">
            {groupe === GROUPE_AUTRES
              ? "Aucune autre ligne en circulation pour le moment"
              : "Chargement des lignes…"}
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto scrollbar-hidden justify-center flex-wrap max-h-[124px] overflow-y-auto">
            {ids.map((routeId) => {
              const info = lignesInfo[routeId];
              const actif = lignesActives.has(routeId);
              return (
                <button
                  key={routeId}
                  onClick={() => onBasculerLigne(routeId)}
                  className="shrink-0 rounded-full px-3.5 py-1.5 text-[13.5px] font-bold font-signage text-white shadow transition-opacity active:scale-95"
                  style={{ background: info.couleur, opacity: actif ? 1 : 0.35 }}
                >
                  {info.nom}
                </button>
              );
            })}
          </div>
        )}

        {ids.length > 1 && (
          <div className="flex gap-1.5 justify-center mt-2">
            <button
              onClick={onToutAfficher}
              className="rounded-full px-3 py-1 text-[11.5px] border border-white/35 text-white/85"
            >
              Tout afficher
            </button>
            <button
              onClick={onToutMasquer}
              className="rounded-full px-3 py-1 text-[11.5px] border border-white/35 text-white/85"
            >
              Tout masquer
            </button>
          </div>
        )}

        <div className="flex gap-1.5 justify-center mt-3">
          {[
            ["tous", "Toutes"],
            ["0", "Sens 0"],
            ["1", "Sens 1"],
          ].map(([valeur, label]) => (
            <button
              key={valeur}
              onClick={() => onChangerDirection(valeur)}
              className={
                "rounded-full px-3 py-1 text-[12px] border transition-colors " +
                (direction === valeur
                  ? "bg-white text-[var(--chrome-950)] border-white"
                  : "border-white/35 text-white bg-transparent")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
