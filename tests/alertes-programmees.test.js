import { describe, expect, it } from "vitest";
import { idAlerte, alerteRecurrenteADeclencher } from "../src/alertes.js";

describe("idAlerte", () => {
  it("identifie une alerte par type + ligne + sens + arrêt", () => {
    expect(idAlerte({ type: "approche", routeId: "2", direction: "0", stopId: "S1" })).toBe(
      "approche|2|0|S1"
    );
    // Type par défaut = approche
    expect(idAlerte({ routeId: "2", direction: "", stopId: "S1" })).toBe("approche|2||S1");
  });
});

describe("alerteRecurrenteADeclencher", () => {
  // Mardi 7 juillet 2026, 07:50 (locale du runtime de test)
  const mardi = new Date(2026, 6, 7, 7, 50, 0);

  const liste = [
    {
      id: "a",
      nomArret: "Gare",
      recurrence: { jours: [1, 2, 3, 4, 5], heure: "07:50" },
    },
    {
      id: "b",
      nomArret: "Théâtre",
      recurrence: { jours: [0, 6], heure: "07:50" },
    },
  ];

  it("retient l'alerte dont le jour et l'heure correspondent", () => {
    expect(alerteRecurrenteADeclencher(liste, mardi)?.id).toBe("a");
  });

  it("ne retient rien en dehors du créneau", () => {
    expect(alerteRecurrenteADeclencher(liste, new Date(2026, 6, 7, 8, 5))).toBeNull();
    expect(alerteRecurrenteADeclencher(liste, new Date(2026, 6, 5, 7, 50))?.id).toBe("b");
  });

  it("ne redéclenche pas dans la même minute", () => {
    const dejaFait = [
      {
        id: "a",
        nomArret: "Gare",
        recurrence: {
          jours: [2],
          heure: "07:50",
          derniereExecution: "2026-07-07 07:50",
        },
      },
    ];
    expect(alerteRecurrenteADeclencher(dejaFait, mardi)).toBeNull();
  });

  it("ignore les alertes sans récurrence", () => {
    expect(alerteRecurrenteADeclencher([{ id: "x" }], mardi)).toBeNull();
  });
});
