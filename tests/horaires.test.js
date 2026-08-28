import { describe, expect, it } from "vitest";
import { versSecondes, servicesActifs } from "../netlify/functions/_lib/gtfs-statique.js";

describe("versSecondes", () => {
  it("convertit une heure GTFS en secondes depuis minuit", () => {
    expect(versSecondes("00:00:00")).toBe(0);
    expect(versSecondes("07:50:30")).toBe(7 * 3600 + 50 * 60 + 30);
  });
  it("accepte les heures au-delà de 24h (courses après minuit)", () => {
    expect(versSecondes("25:15:00")).toBe(25 * 3600 + 15 * 60);
  });
  it("renvoie null pour une valeur absente ou invalide", () => {
    expect(versSecondes("")).toBeNull();
    expect(versSecondes("8h30")).toBeNull();
  });
});

describe("servicesActifs", () => {
  const horaires = {
    // Semaine = SEM (lun-ven), dimanche = DIM. 0 = dimanche.
    calendrier: [
      {
        serviceId: "SEM",
        jours: [false, true, true, true, true, true, false],
        debut: "20260101",
        fin: "20261231",
      },
      {
        serviceId: "DIM",
        jours: [true, false, false, false, false, false, false],
        debut: "20260101",
        fin: "20261231",
      },
    ],
    exceptions: {
      // Férié : SEM retiré, DIM ajouté le 14/07/2026 (un mardi)
      "SEM|20260714": "2",
      "DIM|20260714": "1",
    },
  };

  it("retient les services du bon jour de semaine", () => {
    // 20260706 est un lundi
    expect(servicesActifs(horaires, "20260706", 1)).toEqual(new Set(["SEM"]));
    // 20260705 est un dimanche
    expect(servicesActifs(horaires, "20260705", 0)).toEqual(new Set(["DIM"]));
  });

  it("applique les exceptions du calendrier (ajout / retrait)", () => {
    // Mardi 14/07 : normalement SEM, mais l'exception bascule sur DIM
    expect(servicesActifs(horaires, "20260714", 2)).toEqual(new Set(["DIM"]));
  });

  it("exclut un service hors de sa période de validité", () => {
    expect(servicesActifs(horaires, "20251231", 1)).toEqual(new Set());
  });
});
