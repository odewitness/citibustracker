import { useEffect, useMemo, useState } from "react";
import {
  COULEUR_OCCUPATION,
  COULEUR_RETARD,
  LIBELLE_OCCUPATION,
  agePosition,
  categorieRetard,
  etatPosition,
  formaterAge,
  formaterRetard,
  ordonnerBusLigne,
  resumeLigne,
} from "../utils.js";

// « Ligne N en direct » : tous les véhicules d'une ligne d'un coup d'œil —
// retard, état de position, affluence — dans l'ordre du trajet, avec repérage
// des paquets (bus collés = trou de desserte derrière). Quand plus rien ne
// circule, on bascule sur les prochains départs théoriques (calendrier GTFS),
// y compris le lendemain.

const ETAT_TEXTE = {
  "signal-perdu": "signal perdu",
  "hors-service": "hors service",
  ancienne: "position ancienne",
};

function LigneBus({ bus, info, colle, onChoisir, maintenant }) {
  const a0 = Array.isArray(bus.prochains_arrets) ? bus.prochains_arrets[0] : null;
  const etat = etatPosition(bus, maintenant);
  const occ = bus.occupation;
  const eta =
    a0 && a0.arrivee ? Math.max(0, Math.round((a0.arrivee * 1000 - maintenant) / 60000)) : null;
  const montrerRetard =
    bus.retard !== null && bus.retard !== undefined && Math.abs(bus.retard) >= 60;

  return (
    <>
      {colle && (
        <div className="flex items-center gap-1.5 pl-1 pt-1 text-[10.5px] text-[var(--ink-muted)]">
          <span className="w-4 border-t border-dashed border-[var(--ink-muted)]" />
          paquet · bus collé au précédent
        </div>
      )}
      <button
        onClick={() => onChoisir(bus.id)}
        className="w-full flex items-center gap-2.5 py-2 border-b border-[var(--line)] last:border-0 text-left active:opacity-70"
      >
        <span
          className="shrink-0 w-2.5 h-2.5 rounded-full border-2 border-white"
          style={{
            background: info.couleur,
            boxShadow: `0 0 0 2px ${COULEUR_RETARD[categorieRetard(bus.retard)]}`,
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate">
            {a0 ? a0.nom : "Prochain arrêt inconnu"}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--ink-muted)] flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {montrerRetard && (
              <span
                className="shrink-0 rounded-full px-1.5 py-[1px] text-[10.5px] font-semibold text-white"
                style={{ background: COULEUR_RETARD[categorieRetard(bus.retard)] }}
              >
                {formaterRetard(bus.retard)}
              </span>
            )}
            {ETAT_TEXTE[etat] && (
              <span className="text-[var(--danger)]">
                ⚠ {ETAT_TEXTE[etat]} ({formaterAge(agePosition(bus, maintenant))})
              </span>
            )}
            {occ && occ.niveau && (
              <span className="font-semibold" style={{ color: COULEUR_OCCUPATION[occ.niveau] }}>
                {LIBELLE_OCCUPATION[occ.niveau]}
                {occ.pct !== null && occ.pct !== undefined ? ` · ${occ.pct} %` : ""}
              </span>
            )}
            {bus.pmr === true && <span title="Course accessible UFR">♿</span>}
          </div>
        </div>
        <div className="shrink-0 text-right leading-none">
          {eta === null ? (
            <span className="text-[11px] text-[var(--ink-muted)]">—</span>
          ) : (
            <>
              <span className="font-signage font-bold text-[15px] tabular-nums">{eta}</span>
              <span className="text-[10px] ml-0.5">min</span>
            </>
          )}
        </div>
      </button>
    </>
  );
}

export default function PanneauLigne({
  ouvert,
  onFermer,
  routeId,
  sensInitial = "tous",
  ids = [],
  onChangerLigne,
  lignesInfo = {},
  vehicules = [],
  arretsParDirection = {},
  directionsDisponibles = [],
  alertes = [],
  onChoisirBus,
  onOuvrirArrets,
  onAfficherSurCarte,
}) {
  const [sens, setSens] = useState(sensInitial);
  // { statut, passages, premiers } — départs théoriques, seulement chargés quand
  // la ligne est à l'arrêt.
  const [theo, setTheo] = useState(() => ({ statut: "chargement", passages: [], premiers: {} }));
  // Horloge locale : garde les « dans N min » justes entre deux relevés de 15 s.
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const busLigne = useMemo(
    () => vehicules.filter((v) => String(v.ligne) === String(routeId)),
    [vehicules, routeId]
  );
  const vide = busLigne.length === 0;

  useEffect(() => {
    if (!ouvert || !routeId || !vide) return;
    let annule = false;
    fetch(`/.netlify/functions/horaires-ligne?ligne=${encodeURIComponent(routeId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (annule) return;
        setTheo({
          statut: d.erreur ? "erreur" : "ok",
          passages: d.passages || [],
          premiers: d.premiers_par_sens || {},
        });
      })
      .catch(() => {
        if (!annule) setTheo({ statut: "erreur", passages: [], premiers: {} });
      });
    return () => {
      annule = true;
    };
  }, [ouvert, routeId, vide]);

  const groupes = useMemo(
    () => ordonnerBusLigne(vehicules, routeId, sens, arretsParDirection),
    [vehicules, routeId, sens, arretsParDirection]
  );
  const resume = useMemo(() => resumeLigne(vehicules, routeId), [vehicules, routeId]);
  const alertesLigne = useMemo(
    () => (alertes || []).filter((a) => (a.lignes || []).includes(String(routeId))),
    [alertes, routeId]
  );

  if (!ouvert || !routeId) return null;

  const info = lignesInfo[routeId] || { nom: routeId, couleur: "var(--chrome-800)" };
  const libelleSens = (dir) =>
    (directionsDisponibles.find(([d]) => d === String(dir)) || [])[1] || `Sens ${dir}`;
  const retardMed = resume.retardMedianSec;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Bus de la ligne ${info.nom} en direct`}
      className="fixed inset-x-0 bottom-0 z-[1095] flex justify-center px-3"
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl shadow-black/30 flex flex-col max-h-[82vh] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--line)]">
          <span
            className="shrink-0 min-w-[30px] h-[26px] px-2 rounded-full flex items-center justify-center text-[13px] font-bold text-white font-signage"
            style={{ background: info.couleur }}
          >
            {info.nom}
          </span>
          <h2 className="flex-1 min-w-0 text-sm font-bold font-signage truncate">
            Ligne {info.nom} en direct
          </h2>
          <button
            onClick={onFermer}
            aria-label="Fermer"
            className="shrink-0 w-7 h-7 rounded-full bg-[var(--line)] text-[var(--ink)] text-sm leading-none"
          >
            ✕
          </button>
        </div>

        {ids.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hidden px-4 py-2 border-b border-[var(--line)]">
            {ids.map((id) => {
              const i = lignesInfo[id] || { nom: id, couleur: "var(--chrome-800)" };
              const actif = String(id) === String(routeId);
              return (
                <button
                  key={id}
                  onClick={() => onChangerLigne?.(id)}
                  aria-pressed={actif}
                  className="shrink-0 rounded-full px-3 py-1 text-[12.5px] font-bold font-signage text-white transition-opacity active:scale-95"
                  style={{ background: i.couleur, opacity: actif ? 1 : 0.3 }}
                >
                  {i.nom}
                </button>
              );
            })}
          </div>
        )}

        <div className="overflow-y-auto px-4 py-2">
          {resume.total > 0 && (
            <p className="text-[12px] text-[var(--ink-muted)] pb-2 flex flex-wrap gap-x-2 gap-y-0.5">
              <span className="font-semibold text-[var(--ink)]">
                {resume.enService} bus en service
              </span>
              {retardMed !== null && (
                <span style={{ color: COULEUR_RETARD[categorieRetard(retardMed)] }}>
                  · {formaterRetard(retardMed)} (médian)
                </span>
              )}
              {resume.fantomes > 0 && <span>· {resume.fantomes} signal perdu</span>}
            </p>
          )}

          {alertesLigne.map((a) => (
            <div key={a.id} className="rounded-xl bg-[var(--danger)] text-white p-2.5 mb-2">
              {a.effet && (
                <span className="inline-block rounded-full bg-white/25 px-2 py-[1px] text-[10px] font-bold uppercase tracking-wide mb-1">
                  {a.effet}
                </span>
              )}
              <div className="text-[12.5px] font-semibold leading-snug">{a.titre}</div>
              {a.description && (
                <div className="text-[11.5px] leading-snug opacity-90 mt-0.5 whitespace-pre-line">
                  {a.description}
                </div>
              )}
            </div>
          ))}

          {directionsDisponibles.length > 1 && (
            <div className="flex gap-0.5 p-0.5 rounded-full bg-[var(--line)] mb-2">
              {[["tous", "Tous"], ...directionsDisponibles.map(([d]) => [d, "→ " + libelleSens(d)])].map(
                ([valeur, label]) => (
                  <button
                    key={valeur}
                    onClick={() => setSens(valeur)}
                    className={
                      "flex-1 min-w-0 truncate rounded-full py-1 text-[11.5px] transition-colors " +
                      (sens === valeur
                        ? "bg-white text-[var(--chrome-950)] font-semibold shadow-sm"
                        : "text-[var(--ink-muted)]")
                    }
                  >
                    {label}
                  </button>
                )
              )}
            </div>
          )}

          {resume.total > 0 && groupes.length === 0 && (
            <p className="text-[12.5px] text-[var(--ink-muted)] py-2">
              Aucun bus dans ce sens pour le moment.
            </p>
          )}

          {resume.total > 0 ? (
            groupes.map((groupe) => (
              <div key={groupe.direction} className="pb-1">
                {sens === "tous" && (
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)] pt-2 pb-0.5">
                    → {libelleSens(groupe.direction)}
                  </p>
                )}
                {groupe.bus.map((bus, i) => (
                  <LigneBus
                    key={bus.id}
                    bus={bus}
                    info={info}
                    colle={groupe.colle[i]}
                    onChoisir={onChoisirBus}
                    maintenant={maintenant}
                  />
                ))}
              </div>
            ))
          ) : (
            <div className="py-2">
              <p className="text-[13px] text-[var(--ink-muted)]">
                Aucun bus en circulation sur la ligne {info.nom}.
              </p>

              {theo.statut === "chargement" && (
                <p className="text-[12px] text-[var(--ink-muted)] py-2">Recherche des horaires…</p>
              )}

              {theo.statut === "ok" && Object.keys(theo.premiers).length > 0 && (
                <div className="mt-2 rounded-xl border border-[var(--line)] p-2.5 flex flex-col gap-1">
                  {Object.entries(theo.premiers).map(([dir, p]) => (
                    <div key={dir} className="text-[12.5px]">
                      Reprise → {libelleSens(dir)} :{" "}
                      <span className="font-semibold font-signage">
                        {p.demain ? "demain " : ""}
                        {p.heure}
                      </span>
                      {p.destination ? ` · ${p.destination}` : ""}
                    </div>
                  ))}
                </div>
              )}

              {theo.statut === "ok" && theo.passages.length > 0 && (
                <div className="mt-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)] pb-0.5">
                    Prochains départs théoriques
                  </p>
                  {theo.passages.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 py-1.5 border-b border-[var(--line)] last:border-0"
                    >
                      <span className="flex-1 min-w-0 truncate text-[12.5px]">
                        → {p.destination || libelleSens(p.direction)}
                        {p.pmr === true && <span title="Course accessible UFR"> ♿</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-[12.5px] font-semibold">
                        {p.demain
                          ? `demain ${p.heure}`
                          : p.dans <= 90
                            ? `${p.heure} · dans ${p.dans} min`
                            : p.heure}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {theo.statut === "ok" && theo.passages.length === 0 && (
                <p className="text-[12px] text-[var(--ink-muted)] py-2">
                  Aucun départ au calendrier dans les 36 prochaines heures.
                </p>
              )}

              {theo.statut === "erreur" && (
                <p className="text-[12px] text-[var(--ink-muted)] py-2">
                  Horaires théoriques indisponibles.
                </p>
              )}

              {onOuvrirArrets && (
                <button
                  onClick={onOuvrirArrets}
                  className="w-full mt-3 py-2 rounded-lg text-[12.5px] bg-[var(--chrome-950)] text-white"
                >
                  Voir les horaires par arrêt
                </button>
              )}
            </div>
          )}

          {resume.total > 0 && onAfficherSurCarte && (
            <button
              onClick={() => onAfficherSurCarte(routeId)}
              className="w-full mt-2 mb-1 py-2 rounded-lg text-[12.5px] border border-[var(--line)] text-[var(--ink)] font-semibold"
            >
              Voir les {resume.total} bus sur la carte
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
