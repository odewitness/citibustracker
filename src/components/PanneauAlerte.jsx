import { useMemo, useState } from "react";
import { normaliserTexte } from "../utils.js";

// Seuils proposés selon le type d'alerte : minutes avant le passage pour
// « à l'approche », minutes avant l'arrivée à destination pour « descente ».
const SEUILS_APPROCHE = [2, 5, 10];
const SEUILS_DESCENTE = [1, 2, 3];

// Au-delà, la liste des arrêts se parcourt mal au pouce : le champ de recherche
// devient le moyen normal d'atteindre le sien.
const SEUIL_RECHERCHE = 12;

// Jours de la semaine dans l'ordre d'affichage, avec l'index Date.getDay().
const JOURS = [
  ["L", 1],
  ["M", 2],
  ["M", 3],
  ["J", 4],
  ["V", 5],
  ["S", 6],
  ["D", 0],
];

function Etape({ numero, titre, children, aide }) {
  return (
    <section className="px-4 py-3 border-b border-[var(--line)] last:border-0">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="shrink-0 w-[18px] h-[18px] rounded-full bg-[var(--chrome-950)] text-white text-[11px] font-bold flex items-center justify-center font-signage">
          {numero}
        </span>
        <h3 className="text-[13px] font-semibold">{titre}</h3>
        {aide && <span className="text-[11.5px] text-[var(--ink-muted)] ml-auto">{aide}</span>}
      </div>
      {children}
    </section>
  );
}

function RecurrenceEditeur({ recurrence, onChange }) {
  const active = Boolean(recurrence);
  const jours = recurrence?.jours || [1, 2, 3, 4, 5];
  const heure = recurrence?.heure || "07:50";

  return (
    <div className="mt-1.5 rounded-lg bg-[var(--line)]/40 p-2">
      <label className="flex items-center gap-2 text-[12px] font-semibold">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => onChange(e.target.checked ? { jours, heure } : null)}
        />
        Réarmer automatiquement
      </label>
      {active && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {JOURS.map(([lettre, index], i) => {
            const coche = jours.includes(index);
            return (
              <button
                key={i}
                onClick={() =>
                  onChange({
                    heure,
                    jours: coche ? jours.filter((j) => j !== index) : [...jours, index],
                  })
                }
                className={
                  "w-7 h-7 rounded-full text-[11px] font-bold " +
                  (coche
                    ? "bg-[var(--chrome-950)] text-white"
                    : "bg-white text-[var(--ink-muted)] border border-[var(--line)]")
                }
              >
                {lettre}
              </button>
            );
          })}
          <input
            type="time"
            value={heure}
            onChange={(e) => onChange({ jours, heure: e.target.value })}
            className="ml-1 rounded-lg border border-[var(--line)] px-2 py-1 text-[12px]"
          />
        </div>
      )}
    </div>
  );
}

export default function PanneauAlerte({
  ouvert,
  onFermer,
  lignesInfo,
  ids = [],
  ligneChoisie,
  onChangerLigne,
  directionsDisponibles = [],
  directionChoisie,
  onChangerDirection,
  arretsDisponibles = [],
  arretChoisi,
  onChangerArret,
  seuil,
  onChangerSeuil,
  onActiver,
  avertissementArrierePlan,
  alerteArmee,
  onDesactiver,
  mode = "approche",
  onChangerMode,
  onPartager,
  onEnregistrer,
  alertesProgrammees = [],
  onArmerProgrammee,
  onSupprimerProgrammee,
  onDefinirRecurrence,
}) {
  const [requete, setRequete] = useState("");
  const [ongletMesAlertes, setOngletMesAlertes] = useState(false);
  const requeteNorm = normaliserTexte(requete);

  const seuils = mode === "descente" ? SEUILS_DESCENTE : SEUILS_APPROCHE;

  const arretsFiltres = useMemo(
    () =>
      requeteNorm
        ? arretsDisponibles.filter(([, nom]) => normaliserTexte(nom).includes(requeteNorm))
        : arretsDisponibles,
    [arretsDisponibles, requeteNorm]
  );

  if (!ouvert) return null;

  const info = (routeId) => lignesInfo[routeId] || { nom: routeId, couleur: "var(--chrome-800)" };
  const nomArretChoisi = arretsDisponibles.find(([id]) => id === arretChoisi)?.[1];
  const titreArret = mode === "descente" ? "Mon arrêt de descente" : "Arrêt à surveiller";
  const titreSeuil =
    mode === "descente" ? "Me prévenir avant l'arrivée" : "Me prévenir quand le bus est à";

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[1095] flex justify-center px-3"
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl shadow-black/30 flex flex-col max-h-[84vh] overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2.5 border-b border-[var(--line)]">
          <span className="text-lg leading-none">🔔</span>
          <h2 className="flex-1 text-sm font-bold font-signage">Alertes</h2>
          {onPartager && !ongletMesAlertes && (
            <button
              onClick={onPartager}
              aria-label="Partager cette alerte"
              className="shrink-0 w-7 h-7 rounded-full bg-[var(--line)] text-[var(--ink)] text-[13px] leading-none"
            >
              ⤴
            </button>
          )}
          <button
            onClick={onFermer}
            aria-label="Fermer"
            className="shrink-0 w-7 h-7 rounded-full bg-[var(--line)] text-[var(--ink)] text-sm leading-none"
          >
            ✕
          </button>
        </div>

        {/* Onglets : composer une alerte / retrouver les alertes mémorisées */}
        <div className="flex gap-1 p-1 mx-4 mt-2 rounded-full bg-[var(--line)]/60">
          <button
            onClick={() => setOngletMesAlertes(false)}
            className={
              "flex-1 rounded-full py-1.5 text-[12px] font-semibold transition-colors " +
              (!ongletMesAlertes ? "bg-white shadow-sm" : "text-[var(--ink-muted)]")
            }
          >
            Nouvelle
          </button>
          <button
            onClick={() => setOngletMesAlertes(true)}
            className={
              "flex-1 rounded-full py-1.5 text-[12px] font-semibold transition-colors " +
              (ongletMesAlertes ? "bg-white shadow-sm" : "text-[var(--ink-muted)]")
            }
          >
            Mes alertes{alertesProgrammees.length > 0 ? ` (${alertesProgrammees.length})` : ""}
          </button>
        </div>

        {ongletMesAlertes ? (
          <div className="overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {alertesProgrammees.length === 0 ? (
              <p className="text-[12.5px] text-[var(--ink-muted)] py-4 text-center">
                Aucune alerte mémorisée. Compose une alerte puis « Enregistrer » pour la retrouver
                ici.
              </p>
            ) : (
              alertesProgrammees.map((a) => (
                <div key={a.id} className="rounded-xl border border-[var(--line)] p-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="shrink-0 rounded-full px-2 py-[1px] text-[11px] font-bold text-white font-signage"
                      style={{ background: info(a.routeId).couleur }}
                    >
                      {info(a.routeId).nom}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold truncate">{a.nomArret}</div>
                      <div className="text-[11px] text-[var(--ink-muted)]">
                        {a.type === "descente" ? "Descente" : "À l'approche"} · {a.seuilMinutes} min
                      </div>
                    </div>
                    <button
                      onClick={() => onSupprimerProgrammee?.(a.id)}
                      aria-label="Supprimer"
                      className="shrink-0 w-7 h-7 rounded-full bg-[var(--line)] text-[var(--ink)] text-xs leading-none"
                    >
                      ✕
                    </button>
                  </div>
                  <RecurrenceEditeur
                    recurrence={a.recurrence}
                    onChange={(r) => onDefinirRecurrence?.(a.id, r)}
                  />
                  <button
                    onClick={() => onArmerProgrammee?.(a)}
                    className="w-full mt-2 py-2 rounded-lg text-[12.5px] bg-[var(--chrome-950)] text-white font-semibold"
                  >
                    Armer maintenant
                  </button>
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            <div className="overflow-y-auto">
              <Etape numero="1" titre="Type d'alerte">
                <div className="flex gap-1.5">
                  {[
                    ["approche", "À l'approche"],
                    ["descente", "Descente (à bord)"],
                  ].map(([valeur, libelle]) => (
                    <button
                      key={valeur}
                      onClick={() => onChangerMode?.(valeur)}
                      aria-pressed={mode === valeur}
                      className={
                        "flex-1 py-2 rounded-xl text-[12.5px] border transition-colors " +
                        (mode === valeur
                          ? "border-[var(--chrome-950)] bg-[var(--chrome-950)] text-white font-semibold"
                          : "border-[var(--line)] bg-white text-[var(--ink)]")
                      }
                    >
                      {libelle}
                    </button>
                  ))}
                </div>
              </Etape>

              <Etape numero="2" titre="Ligne">
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hidden -mx-1 px-1 pb-0.5">
                  {ids.map((routeId) => {
                    const l = info(routeId);
                    const actif = routeId === ligneChoisie;
                    return (
                      <button
                        key={routeId}
                        onClick={() => onChangerLigne(routeId)}
                        aria-pressed={actif}
                        className={
                          "shrink-0 min-w-[38px] h-9 px-2.5 rounded-full font-signage text-[13.5px] font-bold transition-[transform,opacity] active:scale-95 " +
                          (actif
                            ? "text-white ring-2 ring-offset-2 ring-[var(--chrome-950)]"
                            : "text-white opacity-45")
                        }
                        style={{ background: l.couleur }}
                      >
                        {l.nom}
                      </button>
                    );
                  })}
                </div>
              </Etape>

              <Etape numero="3" titre="Direction">
                {directionsDisponibles.length === 0 ? (
                  <p className="text-[12.5px] text-[var(--ink-muted)]">
                    Aucune direction connue pour cette ligne.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {directionsDisponibles.map(([valeur, libelle]) => {
                      const actif = String(valeur) === String(directionChoisie);
                      return (
                        <button
                          key={valeur}
                          onClick={() => onChangerDirection(valeur)}
                          aria-pressed={actif}
                          className={
                            "w-full text-left px-3 py-2.5 rounded-xl text-[13.5px] border transition-colors " +
                            (actif
                              ? "border-[var(--chrome-950)] bg-[var(--chrome-950)] text-white font-semibold"
                              : "border-[var(--line)] bg-white text-[var(--ink)]")
                          }
                        >
                          <span className="opacity-60 mr-1.5">→</span>
                          {libelle}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Etape>

              <Etape
                numero="4"
                titre={titreArret}
                aide={arretsDisponibles.length > 0 ? `${arretsDisponibles.length} arrêts` : null}
              >
                {arretsDisponibles.length === 0 ? (
                  <p className="text-[12.5px] text-[var(--ink-muted)]">
                    Aucun arrêt disponible pour cette direction.
                  </p>
                ) : (
                  <>
                    {arretsDisponibles.length > SEUIL_RECHERCHE && (
                      <input
                        type="search"
                        value={requete}
                        onChange={(e) => setRequete(e.target.value)}
                        placeholder="Chercher un arrêt sur la ligne…"
                        className="w-full mb-2 p-2 rounded-lg border border-[var(--line)] text-sm"
                      />
                    )}
                    <div className="max-h-52 overflow-y-auto -mx-1 px-1">
                      {arretsFiltres.length === 0 ? (
                        <p className="text-[12.5px] text-[var(--ink-muted)] py-2">
                          Aucun arrêt ne correspond à « {requete} ».
                        </p>
                      ) : (
                        arretsFiltres.map(([stopId, nom]) => {
                          const actif = stopId === arretChoisi;
                          return (
                            <button
                              key={stopId}
                              onClick={() => onChangerArret(stopId)}
                              aria-pressed={actif}
                              className={
                                "w-full text-left flex items-stretch gap-2.5 pl-1 pr-2 min-h-[36px] rounded-lg " +
                                (actif ? "bg-[var(--chrome-950)]/[.06]" : "")
                              }
                            >
                              <span className="relative shrink-0 w-3 flex justify-center self-stretch">
                                <span className="absolute inset-y-0 w-[2px] bg-[var(--line)]" />
                                <span
                                  className={
                                    "relative my-auto rounded-full border-2 border-white " +
                                    (actif
                                      ? "w-3 h-3 bg-[var(--amber-500)] ring-2 ring-[var(--amber-500)]"
                                      : "w-2.5 h-2.5 bg-[var(--ink-muted)]")
                                  }
                                />
                              </span>
                              <span
                                className={
                                  "flex-1 min-w-0 truncate self-center text-[13.5px] " +
                                  (actif ? "font-semibold" : "")
                                }
                              >
                                {nom}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </Etape>

              <Etape numero="5" titre={titreSeuil}>
                <div className="flex gap-1.5">
                  {seuils.map((valeur) => {
                    const actif = valeur === seuil;
                    return (
                      <button
                        key={valeur}
                        onClick={() => onChangerSeuil(valeur)}
                        aria-pressed={actif}
                        className={
                          "flex-1 py-2 rounded-xl text-[13.5px] border transition-colors " +
                          (actif
                            ? "border-[var(--chrome-950)] bg-[var(--chrome-950)] text-white font-semibold"
                            : "border-[var(--line)] bg-white text-[var(--ink)]")
                        }
                      >
                        {valeur} min
                      </button>
                    );
                  })}
                </div>
              </Etape>
            </div>

            <div className="border-t border-[var(--line)] px-4 pt-2.5 pb-3">
              <p className="text-[12px] leading-snug text-[var(--ink-muted)] mb-2">
                {nomArretChoisi ? (
                  <>
                    {mode === "descente" ? "Descente" : "Ligne"}{" "}
                    <b className="text-[var(--ink)]">{info(ligneChoisie).nom}</b> à{" "}
                    <b className="text-[var(--ink)]">{nomArretChoisi}</b>, alerte à{" "}
                    <b className="text-[var(--ink)]">{seuil} min</b>. {avertissementArrierePlan}
                  </>
                ) : (
                  "Choisis un arrêt pour activer l'alerte."
                )}
              </p>
              <div className="flex gap-2">
                {alerteArmee && (
                  <button
                    onClick={onDesactiver}
                    className="px-3 py-2.5 rounded-xl text-[13px] bg-[var(--line)] text-[var(--ink)]"
                  >
                    Désactiver
                  </button>
                )}
                {onEnregistrer && (
                  <button
                    onClick={onEnregistrer}
                    disabled={!arretChoisi}
                    className="px-3 py-2.5 rounded-xl text-[13px] border border-[var(--chrome-950)] text-[var(--chrome-950)] font-semibold disabled:opacity-40"
                  >
                    Enregistrer
                  </button>
                )}
                <button
                  onClick={onActiver}
                  disabled={!arretChoisi}
                  className="flex-1 py-2.5 rounded-xl text-[13.5px] bg-[var(--chrome-950)] text-white font-semibold disabled:opacity-40"
                >
                  {alerteArmee ? "Mettre à jour" : "Activer"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
