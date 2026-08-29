import { useMemo, useState } from "react";
import {
  distanceMetres,
  formaterDistance,
  formaterRetard,
  formaterTempsMarche,
  normaliserTexte,
  prochainsPassages,
  construireLien,
  partagerLien,
} from "../utils.js";
import { useFavoris } from "../favoris.js";
import EtoileFavori from "./EtoileFavori.jsx";
import HorairesTheoriques from "./HorairesTheoriques.jsx";

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
  arretsParLigne = {},
  lignesInfo,
  vehicules,
  position,
  onDemanderPosition,
  positionEnCours,
  onChoisirArret,
  onCreerAlerte,
  arretInitial,
}) {
  const [requete, setRequete] = useState("");
  const [arretOuvert, setArretOuvert] = useState(arretInitial || null); // stop_id du détail affiché
  const [horairesOuverts, setHorairesOuverts] = useState(false);
  const [messagePartage, setMessagePartage] = useState("");
  const { favoris, basculerArret } = useFavoris();

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

  // Favoris épinglés en tête de liste tant qu'aucune recherche n'est en cours.
  const arretsFavoris = useMemo(() => {
    if (requeteNorm) return [];
    return favoris.arrets
      .map((stopId) => {
        const a = arretsInfos[stopId];
        if (!a) return null;
        return {
          stopId,
          nom: a.nom,
          lat: a.lat,
          lon: a.lon,
          distance: position ? distanceMetres(position.lat, position.lon, a.lat, a.lon) : null,
        };
      })
      .filter(Boolean);
  }, [favoris.arrets, arretsInfos, position, requeteNorm]);

  const passagesDuDetail = useMemo(
    () => (arretOuvert ? prochainsPassages(arretOuvert, vehicules) : []),
    [arretOuvert, vehicules]
  );

  // Lignes qui desservent l'arrêt ouvert, d'après la desserte théorique — utile
  // même quand aucun bus ne roule (nuit, dimanche) : les passages temps réel
  // seuls laisseraient l'en-tête vide.
  const lignesDesservies = useMemo(() => {
    if (!arretOuvert) return [];
    return Object.keys(arretsParLigne)
      .filter((rid) => (arretsParLigne[rid] || []).includes(arretOuvert))
      .sort((a, b) =>
        (lignesInfo[a]?.nom || a).localeCompare(lignesInfo[b]?.nom || b, "fr", { numeric: true })
      );
  }, [arretOuvert, arretsParLigne, lignesInfo]);

  if (!ouvert) return null;

  const detailInfos = arretOuvert ? arretsInfos[arretOuvert] : null;
  const distanceDetail =
    detailInfos && position && Number.isFinite(detailInfos.lat) && Number.isFinite(detailInfos.lon)
      ? distanceMetres(position.lat, position.lon, detailInfos.lat, detailInfos.lon)
      : null;

  const infoLigne = (routeId) =>
    lignesInfo[routeId] || { nom: routeId, couleur: "var(--chrome-800)" };

  function ouvrirDetail(a) {
    setArretOuvert(a.stopId);
    setHorairesOuverts(false);
    onChoisirArret(a);
  }

  async function partagerArret(stopId) {
    const resultat = await partagerLien(
      construireLien(window.location.origin + window.location.pathname, { arret: stopId }),
      "Arrêt " + (arretsInfos[stopId]?.nom || stopId)
    );
    if (resultat !== "partage") {
      setMessagePartage(resultat === "copie" ? "Lien copié" : "Partage indisponible");
      setTimeout(() => setMessagePartage(""), 2000);
    }
  }

  function rendreLigneArret(a, favori = false, cle = a.stopId) {
    const passages = prochainsPassages(a.stopId, vehicules).slice(0, 3);
    return (
      <div
        key={cle}
        className="w-full flex items-center gap-2 py-2 border-b border-[var(--line)] last:border-0"
      >
        <button
          onClick={() => ouvrirDetail(a)}
          className="flex-1 min-w-0 text-left active:opacity-70"
        >
          <div className="text-[13.5px] font-semibold truncate flex items-center gap-1.5">
            {favori && <span className="text-[var(--amber-500)] text-[12px]">★</span>}
            {a.nom}
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {passages.length === 0 ? (
              <span className="text-[11.5px] text-[var(--ink-muted)]">Aucun passage prévu</span>
            ) : (
              passages.map((p, i) => (
                <span key={i} className="flex items-center gap-1">
                  <Badge info={infoLigne(p.ligne)} />
                  <span className="text-[11.5px] tabular-nums text-[var(--ink-muted)]">
                    {p.eta} min
                  </span>
                  {p.pmr === true && (
                    <span aria-label="Accessible UFR" title="Accessible UFR" className="text-[11px]">
                      ♿
                    </span>
                  )}
                </span>
              ))
            )}
          </div>
        </button>
        {a.distance !== null && (
          <span className="shrink-0 text-right text-[11.5px] text-[var(--ink-muted)] leading-tight">
            <span className="tabular-nums">{formaterDistance(a.distance)}</span>
            <span className="block text-[10.5px]">{formaterTempsMarche(a.distance)}</span>
          </span>
        )}
        <EtoileFavori
          actif={favoris.arrets.includes(a.stopId)}
          onToggle={() => basculerArret(a.stopId)}
          label={"l'arrêt " + a.nom}
        />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[1095] flex justify-center px-3"
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl shadow-black/30 flex flex-col max-h-[78vh] overflow-hidden">
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
              <div className="flex-1 min-w-0">
                <h2 className="truncate text-sm font-bold font-signage">
                  {arretsInfos[arretOuvert]?.nom || arretOuvert}
                  {arretsInfos[arretOuvert]?.pmr === true && (
                    <span
                      aria-label="Arrêt accessible UFR"
                      title="Arrêt accessible UFR"
                      className="ml-1.5 text-[12px] font-normal"
                    >
                      ♿
                    </span>
                  )}
                </h2>
                {distanceDetail !== null && (
                  <div className="text-[11px] text-[var(--ink-muted)] tabular-nums leading-tight mt-0.5">
                    {formaterDistance(distanceDetail)} · {formaterTempsMarche(distanceDetail)}
                  </div>
                )}
              </div>
              <EtoileFavori
                actif={favoris.arrets.includes(arretOuvert)}
                onToggle={() => basculerArret(arretOuvert)}
                label="cet arrêt"
              />
              <button
                onClick={() => partagerArret(arretOuvert)}
                aria-label="Partager cet arrêt"
                className="shrink-0 w-7 h-7 rounded-full bg-[var(--line)] text-[var(--ink)] text-[13px] leading-none"
              >
                ⤴
              </button>
              <button
                onClick={onFermer}
                aria-label="Fermer"
                className="shrink-0 w-7 h-7 rounded-full bg-[var(--line)] text-[var(--ink)] text-sm leading-none"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-2">
              {lignesDesservies.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pb-2 mb-1 border-b border-[var(--line)]">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)] mr-0.5">
                    Lignes
                  </span>
                  {lignesDesservies.map((rid) => (
                    <Badge key={rid} info={infoLigne(rid)} />
                  ))}
                </div>
              )}
              {messagePartage && (
                <p className="text-[11.5px] text-[var(--ink-muted)] pb-1">{messagePartage}</p>
              )}
              {passagesDuDetail.length === 0 ? (
                <p className="text-[13px] text-[var(--ink-muted)] py-3">
                  Aucun passage temps réel pour le moment à cet arrêt.
                </p>
              ) : (
                passagesDuDetail.slice(0, 10).map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 py-2 border-b border-[var(--line)] last:border-0"
                  >
                    <Badge info={infoLigne(p.ligne)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] truncate">
                        {p.destination || "—"}
                        {p.pmr === true && (
                          <span title="Accessible UFR" className="ml-1">
                            ♿
                          </span>
                        )}
                      </div>
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

              <button
                onClick={() => setHorairesOuverts((o) => !o)}
                className="w-full flex items-center justify-between py-2 mt-1 text-[12.5px] font-semibold text-[var(--chrome-800)]"
              >
                <span>Horaires théoriques (calendrier)</span>
                <span className="text-[var(--ink-muted)]">{horairesOuverts ? "−" : "+"}</span>
              </button>
              {horairesOuverts && (
                <HorairesTheoriques stopId={arretOuvert} lignesInfo={lignesInfo} />
              )}

              {onCreerAlerte && (
                <button
                  onClick={() => onCreerAlerte(arretOuvert)}
                  className="w-full mt-2 mb-1 py-2 rounded-lg text-[12.5px] bg-[var(--chrome-950)] text-white"
                >
                  🔔 Créer une alerte sur cet arrêt
                </button>
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
              {arretsFavoris.length > 0 && (
                <>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)] pt-1 pb-0.5">
                    Favoris
                  </p>
                  {arretsFavoris.map((a) => rendreLigneArret(a, true, "fav-" + a.stopId))}
                  {arrets.length > 0 && (
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)] pt-3 pb-0.5">
                      {position ? "À proximité" : "Tous les arrêts"}
                    </p>
                  )}
                </>
              )}

              {arrets.length === 0 && arretsFavoris.length === 0 ? (
                <p className="text-[13px] text-[var(--ink-muted)] py-3">
                  Aucun arrêt ne correspond à « {requete} ».
                </p>
              ) : (
                arrets.map((a) => rendreLigneArret(a))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
