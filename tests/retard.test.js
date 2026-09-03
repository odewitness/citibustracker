import { describe, expect, it } from "vitest";
import { retardStopTime, construireArretPrevu, arretsAVenir } from "../netlify/functions/bus-data.js";

describe("retardStopTime", () => {
  it("prend arrival.delay quand il est présent", () => {
    expect(retardStopTime({ arrival: { delay: 90 }, departure: { delay: 0 } })).toBe(90);
  });

  it("traite un retard nul comme une valeur valable (bus à l'heure)", () => {
    // Le piège corrigé : `s.arrival.delay || s.departure.delay` renvoyait 45
    // parce que 0 est falsy.
    expect(retardStopTime({ arrival: { delay: 0 }, departure: { delay: 45 } })).toBe(0);
  });

  it("retombe sur departure.delay quand arrival.delay est absent", () => {
    expect(retardStopTime({ departure: { delay: -30 } })).toBe(-30);
  });

  it("garde les retards négatifs (avance)", () => {
    expect(retardStopTime({ arrival: { delay: -120 } })).toBe(-120);
  });

  it("renvoie null quand aucun retard n'est renseigné", () => {
    expect(retardStopTime({ arrival: { time: 1700000000 } })).toBeNull();
    expect(retardStopTime({})).toBeNull();
    expect(retardStopTime(null)).toBeNull();
  });
});

describe("construireArretPrevu", () => {
  const arrets = { _1: "Gare Routière" };
  // 2025-01-06 09:20:00 UTC = 10:20 à Paris (heure d'hiver, UTC+1)
  const epoch = Date.UTC(2025, 0, 6, 9, 20, 0) / 1000;

  it("reconstitue l'heure théorique = heure prévue moins le retard", () => {
    const r = construireArretPrevu({ stopId: "_1", arrival: { time: epoch, delay: 300 } }, arrets);
    expect(r).toEqual({
      stop_id: "_1",
      nom: "Gare Routière",
      arrivee: epoch,
      retard: 300,
      horaire_prevu: "10:15",
    });
  });

  it("bus à l'heure : heure théorique = heure prévue, retard 0 conservé", () => {
    const r = construireArretPrevu({ stopId: "_1", departure: { time: epoch, delay: 0 } }, arrets);
    expect(r.retard).toBe(0);
    expect(r.horaire_prevu).toBe("10:20");
  });

  it("stopTimeUpdate sans heure (NO_DATA) : arrivee/retard/horaire à null", () => {
    const r = construireArretPrevu({ stopId: "_9", arrival: { delay: 120 } }, arrets);
    expect(r).toEqual({
      stop_id: "_9",
      nom: "_9",
      arrivee: null,
      retard: null,
      horaire_prevu: null,
    });
  });
});

describe("arretsAVenir", () => {
  const MAINTENANT = 1_700_000_000;
  const a = (secondes, extra = {}) => ({
    stopId: `s${secondes}`,
    arrival: { time: MAINTENANT + secondes },
    ...extra,
  });

  it("écarte les arrêts dont l'heure est passée", () => {
    const liste = [a(-600), a(-300), a(120), a(400)];
    expect(arretsAVenir(liste, MAINTENANT, true).map((s) => s.stopId)).toEqual(["s120", "s400"]);
  });

  it("tolère une minute pour un arrêt tout juste desservi", () => {
    expect(arretsAVenir([a(-30)], MAINTENANT, true)).toHaveLength(1);
    expect(arretsAVenir([a(-90)], MAINTENANT, true)).toHaveLength(0);
  });

  it("vide la liste d'une course terminée depuis des heures", () => {
    // Le cas « Signal perdu depuis 178 min » : le flux publie encore la course,
    // tous ses arrêts sont au passé.
    const finie = [a(-11000), a(-10800), a(-10600)];
    expect(arretsAVenir(finie, MAINTENANT, true)).toEqual([]);
  });

  it("écarte un arrêt supprimé (SKIPPED) même à venir", () => {
    expect(arretsAVenir([a(300, { scheduleRelationship: 1 })], MAINTENANT, true)).toEqual([]);
  });

  it("retombe sur departure.time quand arrival est absent", () => {
    const s = { stopId: "d", departure: { time: MAINTENANT + 60 } };
    expect(arretsAVenir([s], MAINTENANT, true)).toHaveLength(1);
  });

  it("garde ou non un arrêt sans heure selon l'appelant", () => {
    const sansHeure = [{ stopId: "x" }];
    expect(arretsAVenir(sansHeure, MAINTENANT, true)).toHaveLength(1);
    expect(arretsAVenir(sansHeure, MAINTENANT, false)).toHaveLength(0);
  });

  it("accepte une liste absente", () => {
    expect(arretsAVenir(undefined, MAINTENANT, true)).toEqual([]);
  });
});
