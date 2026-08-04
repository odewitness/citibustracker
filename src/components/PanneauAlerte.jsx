import { trierParOrdreAutorise } from "../utils.js";

export default function PanneauAlerte({
  ouvert,
  onFermer,
  lignesInfo,
  ligneChoisie,
  onChangerLigne,
  directionsDisponibles,
  directionChoisie,
  onChangerDirection,
  arretsDisponibles,
  arretChoisi,
  onChangerArret,
  seuil,
  onChangerSeuil,
  onActiver,
}) {
  if (!ouvert) return null;
  const ids = trierParOrdreAutorise(Object.keys(lignesInfo), lignesInfo);

  return (
    <div className="fixed left-3 right-3 bottom-[78px] z-[1090] flex justify-center">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl shadow-black/30 p-4">
        <h2 className="text-sm font-bold font-signage mb-3">Alerte à l'approche</h2>

        <label className="block text-xs text-[var(--ink-muted)] mb-1">Ligne</label>
        <select
          value={ligneChoisie}
          onChange={(e) => onChangerLigne(e.target.value)}
          className="w-full p-2 rounded-lg border border-[var(--line)] text-sm mb-3"
        >
          {ids.map((routeId) => (
            <option key={routeId} value={routeId}>
              Ligne {lignesInfo[routeId].nom}
            </option>
          ))}
        </select>

        <label className="block text-xs text-[var(--ink-muted)] mb-1">Direction</label>
        <select
          value={directionChoisie}
          onChange={(e) => onChangerDirection(e.target.value)}
          className="w-full p-2 rounded-lg border border-[var(--line)] text-sm mb-3"
        >
          {directionsDisponibles.length === 0 && (
            <option value="">Aucun bus en circulation sur cette ligne pour le moment</option>
          )}
          {directionsDisponibles.map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>
              → {libelle}
            </option>
          ))}
        </select>

        <label className="block text-xs text-[var(--ink-muted)] mb-1">Arrêt à surveiller</label>
        <select
          value={arretChoisi}
          onChange={(e) => onChangerArret(e.target.value)}
          className="w-full p-2 rounded-lg border border-[var(--line)] text-sm mb-3"
        >
          {arretsDisponibles.length === 0 && (
            <option value="">Aucun arrêt disponible pour cette direction</option>
          )}
          {arretsDisponibles.map(([stopId, nom]) => (
            <option key={stopId} value={stopId}>
              {nom}
            </option>
          ))}
        </select>

        <label className="block text-xs text-[var(--ink-muted)] mb-1">
          Me prévenir quand le bus est à
        </label>
        <select
          value={seuil}
          onChange={(e) => onChangerSeuil(Number(e.target.value))}
          className="w-full p-2 rounded-lg border border-[var(--line)] text-sm"
        >
          <option value={2}>2 minutes</option>
          <option value={5}>5 minutes</option>
          <option value={10}>10 minutes</option>
        </select>

        <div className="flex gap-2 mt-4">
          <button
            onClick={onFermer}
            className="flex-1 py-2.5 rounded-lg text-[13.5px] bg-[var(--line)] text-[var(--ink)]"
          >
            Fermer
          </button>
          <button
            onClick={onActiver}
            className="flex-1 py-2.5 rounded-lg text-[13.5px] bg-[var(--chrome-950)] text-white font-semibold"
          >
            Activer
          </button>
        </div>
      </div>
    </div>
  );
}