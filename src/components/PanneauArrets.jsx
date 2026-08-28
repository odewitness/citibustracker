import { useMemo, useState } from "react";
import {
  distanceMetres,
  formaterDistance,
  formaterRetard,
  normaliserTexte,
  prochainsPassages,
} from "../utils.js";

const NB_RESULTATS = 25;

function Badge({ info }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-[1px] text-[11px] font-bold text-white font-signage"
      style={{ background: info.couleur }}
    >
      {info.nom}
    </span>
  );
}

export default function PanneauArrets({
  ouvert,
  onFermer,
  arretsInfos,
  lignesInfo,
  vehicules,
  position,
  onDemanderPosition,
  positionEnCours,
  onChoisirArret,
}) {
  const [requete, setRequete] = useState("");
  const [arretOuvert, setArretOuvert] = useState(null); // stop_id du détail affiché

  const requeteNorm = normaliserTexte(requete);

  // Liste affichée : par proximité quand la position est connue, sinon par nom.
  // La recherche prend le pas sur la proximité mais conserve le tri par distance.
  const arrets = useMemo(() => {
    const tous = Object.keys(arretsInfos).map((stopId) => {
      const a = arretsInfos[stopId];
      return {
        stopId,
        nom: a.nom,
        lat: a.lat,
        lon: a.lon,
        distance: position ? distanceMetres(position.lat, position.lon, a.lat, a.lon) : null,
      };
    });

    const filtres = requeteNorm
      ? tous.filter((a) => normaliserTexte(a.nom).includes(requeteNorm))
      : tous;

    filtres.sort((x, y) => {
      if (x.distance !== null && y.distance !== null) return x.distance - y.distance;
      return x.nom.localeCompare(y.nom, "fr");
    });

    // Sans recherche ni position, tout lister n'aurait aucun sens : on garde une
    // page de résultats, la recherche sert à aller chercher le reste.
    return filtres.slice(0, NB_RESULTATS);
  }, [arretsInfos, position, requeteNorm]);

  const passagesDuDetail = useMemo(
    () => (arretOuvert ? prochainsPassages(arretOuvert, vehicules) : []),
    [arretOuvert, vehicules]
  );

  if (!ouvert) return null;

  const infoLigne = (routeId) =>
    lignesInfo[routeId] || { nom: routeId, couleur: "var(--chrome-800)" };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[1095] flex justify-center px-3"
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl shadow-black/30 flex flex-col max-h-[72vh] overflow-hidden">
        {arretOuvert ? (
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--line)]">
              <button
                onClick={() => setArretOuvert(null)}
                aria-label="Revenir à la liste"
                className="shrink-0 w-7 h-7 rounded-full bg-[var(--line)] text-[var(--ink)] text-sm leading-none"
              >
                ‹
              </button>
              <h2 className="flex-1 min-w-0 truncate text-sm font-bold font-signage">
                {arretsInfos[arretOuvert]?.nom || arretOuvert}
              </h2>
              <button
                onClick={onFermer}
                aria-label="Fermer"
                className="shrink-0 w-7 h-7 rounded-full bg-[var(--line)] text-[var(--ink)] text-sm leading-none"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-2">
              {passagesDuDetail.length === 0 ? (
                <p className="text-[13px] text-[var(--ink-muted)] py-3">
                  Aucun passage prévu pour le moment à cet arrêt.
                </p>
              ) : (
                passagesDuDetail.slice(0, 10).map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 py-2 border-b border-[var(--line)] last:border-0"
                  >
                    <Badge info={infoLigne(p.ligne)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] truncate">{p.destination || "—"}</div>
                      <div className="text-[11.5px] text-[var(--ink-muted)]">
                        {p.horairePrevu && <>Prévu à {p.horairePrevu}</>}
                        {p.retard !== null && p.retard !== undefined && (
                          <> · {formaterRetard(p.retard)}</>
                        )}
                      </div>
                    </div>
                    <div className="font-signage font-bold text-[15px] tabular-nums shrink-0">
                      {p.eta}
                      <span className="text-[10.5px] font-sans font-normal ml-0.5">min</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 pt-3 pb-2">
              <h2 className="flex-1 text-sm font-bold font-signage">
                {requeteNorm ? "Recherche d'arrêt" : position ? "Arrêts les plus proches" : "Arrêts"}
              </h2>
              <button
                onClick={onFermer}
                aria-label="Fermer"
                className="shrink-0 w-7 h-7 rounded-full bg-[var(--line)] text-[var(--ink)] text-sm leading-none"
              >
                ✕
              </button>
            </div>

            <div className="px-4 pb-2">
              <input
                type="search"
                value={requete}
                onChange={(e) => setRequete(e.target.value)}
                placeholder="Chercher un arrêt…"
                className="w-full p-2 rounded-lg border border-[var(--line)] text-sm"
              />
              {!position && (
                <button
                  onClick={onDemanderPosition}
                  disabled={positionEnCours}
                  className="mt-2 w-full py-2 rounded-lg text-[12.5px] bg-[var(--chrome-950)] text-white disabled:opacity-60"
                >
                  {positionEnCours ? "Localisation…" : "Trier par proximité (ma position)"}
                </button>
              )}
            </div>

            <div className="overflow-y-auto px-4 pb-3">
              {arrets.length === 0 ? (
                <p className="text-[13px] text-[var(--ink-muted)] py-3">
                  Aucun arrêt ne correspond à « {requete} ».
                </p>
              ) : (
                arrets.map((a) => {
                  const passages = prochainsPassages(a.stopId, vehicules).slice(0, 3);
                  return (
                    <button
                      key={a.stopId}
                      onClick={() => {
                        setArretOuvert(a.stopId);
                        onChoisirArret(a);
                      }}
                      className="w-full text-left flex items-center gap-2.5 py-2 border-b border-[var(--line)] last:border-0 active:opacity-70"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold truncate">{a.nom}</div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {passages.length === 0 ? (
                            <span className="text-[11.5px] text-[var(--ink-muted)]">
                              Aucun passage prévu
                            </span>
                          ) : (
                            passages.map((p, i) => (
                              <span key={i} className="flex items-center gap-1">
                                <Badge info={infoLigne(p.ligne)} />
                                <span className="text-[11.5px] tabular-nums text-[var(--ink-muted)]">
                                  {p.eta} min
                                </span>
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                      {a.distance !== null && (
                        <span className="shrink-0 text-[11.5px] text-[var(--ink-muted)] tabular-nums">
                          {formaterDistance(a.distance)}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
