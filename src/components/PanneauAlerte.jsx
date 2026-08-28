import { useMemo, useState } from "react";
import { normaliserTexte } from "../utils.js";

const SEUILS = [2, 5, 10];

// Au-delà, la liste des arrêts se parcourt mal au pouce : le champ de recherche
// devient le moyen normal d'atteindre le sien.
const SEUIL_RECHERCHE = 12;

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
}) {
  const [requete, setRequete] = useState("");
  const requeteNorm = normaliserTexte(requete);

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

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[1095] flex justify-center px-3"
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl shadow-black/30 flex flex-col max-h-[80vh] overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2.5 border-b border-[var(--line)]">
          <span className="text-lg leading-none">🔔</span>
          <h2 className="flex-1 text-sm font-bold font-signage">Alerte à l'approche</h2>
          <button
            onClick={onFermer}
            aria-label="Fermer"
            className="shrink-0 w-7 h-7 rounded-full bg-[var(--line)] text-[var(--ink)] text-sm leading-none"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto">
          <Etape numero="1" titre="Ligne">
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

          <Etape numero="2" titre="Direction">
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
            numero="3"
            titre="Arrêt à surveiller"
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
                {/* Ordre du trajet conservé : la ligne verticale rend lisible le
                    sens de parcours, ce qu'une liste déroulante ne montrait pas. */}
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
                              "flex-1 min-w-0 truncate self-center text-[13.5px] " + (actif ? "font-semibold" : "")
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

          <Etape numero="4" titre="Me prévenir quand le bus est à">
            <div className="flex gap-1.5">
              {SEUILS.map((valeur) => {
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

        {/* Récapitulatif + action, hors zone de défilement : le bouton reste
            accessible au pouce quelle que soit la longueur de la ligne. */}
        <div className="border-t border-[var(--line)] px-4 pt-2.5 pb-3">
          <p className="text-[12px] leading-snug text-[var(--ink-muted)] mb-2">
            {nomArretChoisi ? (
              <>
                Ligne <b className="text-[var(--ink)]">{info(ligneChoisie).nom}</b> à{" "}
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
                className="px-4 py-2.5 rounded-xl text-[13.5px] bg-[var(--line)] text-[var(--ink)]"
              >
                Désactiver
              </button>
            )}
            <button
              onClick={onActiver}
              disabled={!arretChoisi}
              className="flex-1 py-2.5 rounded-xl text-[13.5px] bg-[var(--chrome-950)] text-white font-semibold disabled:opacity-40"
            >
              {alerteArmee ? "Mettre à jour l'alerte" : "Activer l'alerte"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
