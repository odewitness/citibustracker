import { useMemo } from "react";
import { arretsProches, formaterRetard, formaterTempsMarche, prochainsPassages } from "../utils.js";
import { useFavoris } from "../favoris.js";
import EtoileFavori from "./EtoileFavori.jsx";
import HorairesTheoriques from "./HorairesTheoriques.jsx";

// Écran d'accueil : ce qu'on veut savoir sans toucher à la carte — prochains
// départs des arrêts favoris (repli sur l'horaire théorique), arrêts proches,
// infos trafic des lignes suivies, et réarmement rapide d'une alerte mémorisée.

const TITRE = "text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)] pb-1.5";

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

function LignePassage({ p, lignesInfo }) {
  const info = lignesInfo[p.ligne] || { nom: p.ligne, couleur: "var(--chrome-800)" };
  const retard =
    p.retard !== null && p.retard !== undefined && Math.abs(p.retard) > 60
      ? formaterRetard(p.retard)
      : null;
  return (
    <div className="flex items-center gap-2 py-1">
      <Badge info={info} />
      <span className="flex-1 min-w-0 truncate text-[12px] text-[var(--ink-muted)]">
        {p.destination || "—"}
        {p.pmr === true && (
          <span title="Accessible UFR" className="ml-1">
            ♿
          </span>
        )}
        {retard && <span className="ml-1">· {retard}</span>}
        {p.sansPosition && <span className="ml-1" title="Course annoncée, non géolocalisée">· prévu</span>}
      </span>
      <span className="shrink-0 font-signage font-bold text-[13px] tabular-nums">
        {p.sansPosition ? "~" : ""}
        {p.eta}
        <span className="text-[10px] font-sans font-normal ml-0.5">min</span>
      </span>
    </div>
  );
}

function CarteArret({
  arret,
  vehicules,
  passagesPrevus,
  lignesInfo,
  onOuvrir,
  onCreerAlerte,
  favori,
  onToggleFavori,
  montrerDistance,
  realtimePret,
}) {
  const passages = prochainsPassages(arret.stopId, vehicules, passagesPrevus).slice(0, 4);
  return (
    <div className="rounded-xl border border-[var(--line)] p-3">
      <div className="flex items-center gap-2">
        <button onClick={onOuvrir} className="flex-1 min-w-0 text-left active:opacity-70">
          <div className="text-[13.5px] font-semibold truncate">
            {arret.nom}
            {arret.pmr === true && (
              <span title="Arrêt accessible UFR" className="ml-1 font-normal">
                ♿
              </span>
            )}
          </div>
          {montrerDistance && arret.distance !== null && arret.distance !== undefined && (
            <div className="text-[11px] text-[var(--ink-muted)]">
              {formaterTempsMarche(arret.distance)}
            </div>
          )}
        </button>
        {onCreerAlerte && (
          <button
            onClick={() => onCreerAlerte(arret.stopId)}
            aria-label="Créer une alerte sur cet arrêt"
            className="shrink-0 w-7 h-7 rounded-full bg-[var(--line)] text-[var(--ink)] text-[13px] leading-none"
          >
            🔔
          </button>
        )}
        {onToggleFavori && (
          <EtoileFavori actif={favori} onToggle={onToggleFavori} label={"l'arrêt " + arret.nom} />
        )}
      </div>
      <div className="mt-1.5">
        {passages.length > 0 ? (
          passages.map((p, i) => <LignePassage key={i} p={p} lignesInfo={lignesInfo} />)
        ) : realtimePret ? (
          <HorairesTheoriques stopId={arret.stopId} lignesInfo={lignesInfo} max={4} />
        ) : (
          <p className="text-[11.5px] text-[var(--ink-muted)] py-1">Chargement des passages…</p>
        )}
      </div>
    </div>
  );
}

export default function TableauDeBord({
  arretsInfos = {},
  lignesInfo = {},
  vehicules = [],
  passagesPrevus = [],
  alertes = [],
  generatedAt,
  erreur,
  position,
  onDemanderPosition,
  positionEnCours,
  alertesProgrammees = [],
  onArmerProgrammee,
  onOuvrirCarte,
  onOuvrirArret,
  onCreerAlerte,
  onVoirLigne,
  suiviActif,
}) {
  const { favoris, basculerArret } = useFavoris();

  const favLignes = useMemo(() => new Set(favoris.lignes), [favoris.lignes]);
  const favArrets = useMemo(() => new Set(favoris.arrets), [favoris.arrets]);

  // Alertes trafic : restreintes aux lignes / arrêts suivis dès qu'il y a des
  // favoris ; sinon on montre tout (c'est encore utile).
  const alertesPertinentes = useMemo(() => {
    if (favLignes.size === 0 && favArrets.size === 0) return alertes;
    return alertes.filter(
      (a) =>
        (a.lignes || []).some((l) => favLignes.has(l)) ||
        (a.arrets || []).some((s) => favArrets.has(s.stopId))
    );
  }, [alertes, favLignes, favArrets]);

  const arretsFavoris = useMemo(
    () =>
      favoris.arrets
        .map((id) => {
          const a = arretsInfos[id];
          return a ? { stopId: id, nom: a.nom, lat: a.lat, lon: a.lon, pmr: a.pmr ?? null } : null;
        })
        .filter(Boolean),
    [favoris.arrets, arretsInfos]
  );

  const proches = useMemo(
    () => arretsProches(arretsInfos, position, { exclure: favoris.arrets, limite: 5 }),
    [arretsInfos, position, favoris.arrets]
  );

  const reseauCharge = Object.keys(arretsInfos).length > 0;
  const realtimePret = Boolean(generatedAt);

  return (
    <div
      className="fixed inset-0 z-[1150] overflow-y-auto bg-[var(--paper)]"
      style={{
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto w-full max-w-md px-4">
        <div className="flex items-center gap-2 py-2">
          <h1 className="flex-1 text-base font-bold font-signage">Bus Citibus</h1>
          <button
            onClick={onOuvrirCarte}
            className="shrink-0 flex items-center gap-1.5 rounded-full bg-[var(--chrome-950)] text-white px-3.5 py-2 text-[12.5px] font-semibold active:scale-95"
          >
            Carte <span aria-hidden="true">▸</span>
          </button>
        </div>

        <p className="text-[11.5px] text-[var(--ink-muted)] pb-2">
          {erreur ? erreur : generatedAt ? `Temps réel · ${generatedAt}` : "Chargement…"}
        </p>

        {suiviActif && (
          <button
            onClick={onOuvrirCarte}
            className="w-full mb-3 rounded-xl bg-[var(--amber-500)] text-[var(--chrome-950)] px-3 py-2.5 text-[12.5px] font-semibold text-left active:scale-[.99]"
          >
            🔔 Suivi d'un bus en cours — voir la carte ▸
          </button>
        )}

        {alertesPertinentes.length > 0 && (
          <section className="mb-4">
            <h2 className={TITRE}>Infos trafic</h2>
            <div className="flex flex-col gap-2">
              {alertesPertinentes.map((a) => (
                <div key={a.id} className="rounded-xl bg-[var(--danger)] text-white p-2.5">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    {a.effet && (
                      <span className="rounded-full bg-white/25 px-2 py-[1px] text-[10px] font-bold uppercase tracking-wide">
                        {a.effet}
                      </span>
                    )}
                    {(a.lignes || []).map((routeId) => {
                      const info = lignesInfo[routeId] || {
                        nom: routeId,
                        couleur: "var(--chrome-800)",
                      };
                      return onVoirLigne ? (
                        <button
                          key={routeId}
                          onClick={() => onVoirLigne(routeId)}
                          className="rounded-full px-2 py-[1px] text-[10px] font-bold font-signage active:scale-95"
                          style={{ background: info.couleur }}
                        >
                          {info.nom}
                        </button>
                      ) : (
                        <span
                          key={routeId}
                          className="rounded-full px-2 py-[1px] text-[10px] font-bold font-signage"
                          style={{ background: info.couleur }}
                        >
                          {info.nom}
                        </span>
                      );
                    })}
                  </div>
                  <div className="text-[12.5px] font-semibold leading-snug">{a.titre}</div>
                  {a.description && (
                    <div className="text-[11.5px] leading-snug opacity-90 mt-0.5 whitespace-pre-line">
                      {a.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {alertesProgrammees.length > 0 && (
          <section className="mb-4">
            <h2 className={TITRE}>Mes alertes</h2>
            <div className="flex flex-col gap-2">
              {alertesProgrammees.map((a) => {
                const info = lignesInfo[a.routeId] || { nom: a.routeId, couleur: "var(--chrome-800)" };
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-xl border border-[var(--line)] p-2.5"
                  >
                    <Badge info={info} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold truncate">{a.nomArret}</div>
                      <div className="text-[11px] text-[var(--ink-muted)]">
                        {a.type === "descente" ? "Descente" : "À l'approche"} · {a.seuilMinutes} min
                      </div>
                    </div>
                    <button
                      onClick={() => onArmerProgrammee?.(a)}
                      className="shrink-0 rounded-lg bg-[var(--chrome-950)] text-white px-3 py-1.5 text-[12px] font-semibold"
                    >
                      Armer
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {arretsFavoris.length > 0 && (
          <section className="mb-4">
            <h2 className={TITRE}>Mes arrêts</h2>
            <div className="flex flex-col gap-2">
              {arretsFavoris.map((a) => (
                <CarteArret
                  key={a.stopId}
                  arret={a}
                  vehicules={vehicules}
                  passagesPrevus={passagesPrevus}
                  lignesInfo={lignesInfo}
                  onOuvrir={() => onOuvrirArret?.(a)}
                  onCreerAlerte={onCreerAlerte}
                  favori
                  onToggleFavori={() => basculerArret(a.stopId)}
                  montrerDistance={false}
                  realtimePret={realtimePret}
                />
              ))}
            </div>
          </section>
        )}

        <section className="mb-4">
          <h2 className={TITRE}>À proximité</h2>
          {!reseauCharge ? (
            <p className="text-[12.5px] text-[var(--ink-muted)]">Chargement du réseau…</p>
          ) : !position ? (
            <>
              {arretsFavoris.length === 0 && (
                <p className="text-[12.5px] text-[var(--ink-muted)] pb-2">
                  Aucun arrêt favori pour l'instant — épingle-les depuis la carte ou la fiche d'un
                  arrêt.
                </p>
              )}
              <button
                onClick={onDemanderPosition}
                disabled={positionEnCours}
                className="w-full py-2.5 rounded-xl text-[12.5px] bg-[var(--chrome-950)] text-white disabled:opacity-60"
              >
                {positionEnCours ? "Localisation…" : "Voir les arrêts proches (ma position)"}
              </button>
            </>
          ) : proches.length === 0 ? (
            <p className="text-[12.5px] text-[var(--ink-muted)]">Aucun arrêt à proximité.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {proches.map((a) => (
                <CarteArret
                  key={a.stopId}
                  arret={a}
                  vehicules={vehicules}
                  passagesPrevus={passagesPrevus}
                  lignesInfo={lignesInfo}
                  onOuvrir={() => onOuvrirArret?.(a)}
                  onCreerAlerte={onCreerAlerte}
                  favori={favArrets.has(a.stopId)}
                  onToggleFavori={() => basculerArret(a.stopId)}
                  montrerDistance
                  realtimePret={realtimePret}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
