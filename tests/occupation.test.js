import { describe, expect, it } from "vitest";
import { interpreterOccupation } from "../netlify/functions/bus-data.js";

// Rappel des valeurs de l'enum GTFS-RT OccupancyStatus :
// 0 EMPTY · 1 MANY_SEATS_AVAILABLE · 2 FEW_SEATS_AVAILABLE · 3 STANDING_ROOM_ONLY
// 4 CRUSHED_STANDING_ROOM_ONLY · 5 FULL · 6 NOT_ACCEPTING_PASSENGERS

describe("interpreterOccupation", () => {
  it("renvoie null quand le flux ne dit rien", () => {
    expect(interpreterOccupation({})).toBeNull();
  });

  it("ramène l'enum numérique à trois niveaux", () => {
    expect(interpreterOccupation({ occupancyStatus: 0 })).toEqual({ niveau: "faible", pct: null });
    expect(interpreterOccupation({ occupancyStatus: 3 })).toEqual({ niveau: "moyen", pct: null });
    expect(interpreterOccupation({ occupancyStatus: 5 })).toEqual({ niveau: "fort", pct: null });
  });

  it("accepte aussi le nom d'enum en chaîne", () => {
    expect(interpreterOccupation({ occupancyStatus: "STANDING_ROOM_ONLY" }).niveau).toBe("moyen");
  });

  it("déduit un niveau du pourcentage quand le statut manque", () => {
    expect(interpreterOccupation({ occupancyPercentage: 90 })).toEqual({ niveau: "fort", pct: 90 });
    expect(interpreterOccupation({ occupancyPercentage: 20 })).toEqual({
      niveau: "faible",
      pct: 20,
    });
  });

  it("conserve le pourcentage à côté du statut quand les deux sont là", () => {
    expect(interpreterOccupation({ occupancyStatus: 5, occupancyPercentage: 95 })).toEqual({
      niveau: "fort",
      pct: 95,
    });
  });
});
