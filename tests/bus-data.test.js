import { describe, expect, it } from "vitest";
import { horodatagePositionsFiable } from "../netlify/functions/bus-data.js";

// refFlux = instant de référence retenu côté serveur (ici, « maintenant »).
const REF = 1_700_000_000;

// feed factice : N véhicules dont le timestamp est REF - age, plus quelques
// entités sans position (alertes, tripUpdate) qui doivent être ignorées.
const feed = (agesVehicules) => ({
  entity: [
    { alert: {} },
    ...agesVehicules.map((age) => ({ vehicle: { timestamp: REF - age } })),
    { tripUpdate: {} },
  ],
});

describe("horodatagePositionsFiable", () => {
  it("flux décalé : le repère de fraîcheur reste valable (horodatages déjà recalés)", () => {
    // Même une flotte « figée » vue depuis notre horloge ne compte pas ici.
    expect(horodatagePositionsFiable(feed([9000, 9000, 9000, 9000, 9000]), REF, true)).toBe(true);
  });

  it("positions fraîches : horodatage fiable", () => {
    expect(horodatagePositionsFiable(feed([5, 20, 45, 12, 30, 8]), REF, false)).toBe(true);
  });

  it("VehiclePosition.timestamp gelé sur toute la flotte : horodatage non fiable", () => {
    const ages = Array.from({ length: 20 }, () => 14000 + Math.round(Math.random() * 800));
    expect(horodatagePositionsFiable(feed(ages), REF, false)).toBe(false);
  });

  it("ne masque rien si seule une minorité de bus est figée", () => {
    // 3 figés sur 12 (< 60 %) : vrai cluster de bus hors service, on garde le repère.
    const ages = [10, 20, 15, 8, 30, 25, 12, 9, 40, 9000, 9200, 9400];
    expect(horodatagePositionsFiable(feed(ages), REF, false)).toBe(true);
  });

  it("échantillon trop maigre : on garde le repère", () => {
    expect(horodatagePositionsFiable(feed([9000, 9000, 9000]), REF, false)).toBe(true);
  });

  it("aucune position : on garde le repère", () => {
    expect(horodatagePositionsFiable({ entity: [{ alert: {} }] }, REF, false)).toBe(true);
    expect(horodatagePositionsFiable({}, REF, false)).toBe(true);
  });
});
