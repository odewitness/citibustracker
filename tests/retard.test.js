import { describe, expect, it } from "vitest";
import { retardStopTime } from "../netlify/functions/bus-data.js";

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
