import { trierParOrdreAutorise } from "../utils.js";

export default function IleStatut({
  statutTexte,
  lignesInfo,
  lignesActives,
  onBasculerLigne,
  direction,
  onChangerDirection,
}) {
  const ids = trierParOrdreAutorise(Object.keys(lignesInfo), lignesInfo);

  return (
    <div className="fixed top-0 left-0 right-0 z-[1100] flex justify-center px-3 pt-safe pt-3">
      <div className="w-full max-w-md rounded-2xl bg-[var(--chrome-950)]/95 backdrop-blur shadow-lg shadow-black/30 px-4 py-3">
        <div className="flex items-center justify-center gap-2 text-white text-[13px] font-semibold mb-3">
          <span className="w-[7px] h-[7px] rounded-full bg-[var(--amber-500)] animate-pouls shrink-0" />
          <span className="font-signage">{statutTexte}</span>
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-hidden justify-center flex-wrap">
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
