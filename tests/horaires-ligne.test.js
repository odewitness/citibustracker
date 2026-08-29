import { describe, expect, it } from "vitest";
import { collecterDeparts } from "../netlify/functions/horaires-ligne.js";

// 20260706 = lundi. « SEM » actif en semaine, « DIM » le dimanche.
const services = (date, jour) => {
  if (jour === 0) return new Set(["DIM"]);
  if (jour === 6) return new Set(["SEM"]); // samedi, pour la queue après minuit
  return new Set(["SEM"]);
};

const H = (h, m = 0) => h * 3600 + m * 60;

describe("collecterDeparts", () => {
  it("garde les départs du jour encore à venir, triés", () => {
    const departs = [
      { sec: H(6), directionId: "0", serviceId: "SEM", headsign: "Gare", pmr: null },
      { sec: H(6, 10), directionId: "1", serviceId: "SEM", headsign: "Cité", pmr: true },
      { sec: H(5), directionId: "0", serviceId: "SEM", headsign: "Gare", pmr: null }, // passé
    ];
    // lundi 05:30
    const p = collecterDeparts(departs, "20260706", H(5, 30), services);
    expect(p.map((x) => x.heure)).toEqual(["06:00", "06:10"]);
    expect(p[0].demain).toBe(false);
    expect(p[1].pmr).toBe(true);
  });

  it("bascule sur le lendemain quand il ne reste rien aujourd'hui", () => {
    const departs = [
      { sec: H(6), directionId: "0", serviceId: "SEM", headsign: "Gare", pmr: null },
    ];
    // lundi 23:30 → prochain départ = mardi 06:00
    const p = collecterDeparts(departs, "20260706", H(23, 30), services);
    expect(p).toHaveLength(1);
    expect(p[0].heure).toBe("06:00");
    expect(p[0].demain).toBe(true);
    expect(p[0].dans).toBe(6 * 60 + 30); // 6h30 plus tard
  });

  it("rattache une course après minuit (>= 24:00) au service de la veille", () => {
    const departs = [
      { sec: H(25), directionId: "0", serviceId: "SEM", headsign: "Gare", pmr: null }, // 01:00
    ];
    // dimanche 00:30 : DIM actif ce jour, mais la course « 25:00 SEM » relève du
    // samedi (SEM) → elle doit sortir, à 01:00, dans 30 min.
    const p = collecterDeparts(departs, "20260705", H(0, 30), services);
    expect(p).toHaveLength(1);
    expect(p[0].heure).toBe("01:00");
    expect(p[0].dans).toBe(30);
    expect(p[0].demain).toBe(false);
  });

  it("dédoublonne les départs identiques (services qui se chevauchent)", () => {
    const departs = [
      { sec: H(7), directionId: "0", serviceId: "SEM", headsign: "Gare", pmr: null },
      { sec: H(7), directionId: "0", serviceId: "SEM", headsign: "Gare", pmr: null },
    ];
    const p = collecterDeparts(departs, "20260706", H(6, 0), services);
    expect(p).toHaveLength(1);
  });

  it("ignore une ligne dont le service n'est pas actif", () => {
    const departs = [
      { sec: H(8), directionId: "0", serviceId: "SCOLAIRE", headsign: "Collège", pmr: null },
    ];
    expect(collecterDeparts(departs, "20260706", H(6), services)).toEqual([]);
  });
});
