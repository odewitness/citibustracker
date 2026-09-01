import { describe, expect, it } from "vitest";
import { retardStopTime, construireArretPrevu } from "../netlify/functions/bus-data.js";

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
