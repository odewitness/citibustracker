import { describe, expect, it } from "vitest";
import {
  detecterPaquets,
  medianeNombres,
  ordonnerBusLigne,
  positionSurLigne,
  resumeLigne,
} from "../src/utils.js";

const ORDRE = { "2|0": ["A", "B", "C", "D", "E", "F"] };

function bus(over = {}) {
  return {
    id: over.id || "x",
    ligne: "2",
    direction: "0",
    retard: 0,
    horodatage: Math.floor(Date.now() / 1000),
    prochains_arrets: over.prochainStop
      ? [{ stop_id: over.prochainStop, nom: over.prochainStop, arrivee: over.arrivee || null }]
      : [],
    ...over,
  };
}

describe("medianeNombres", () => {
  it("renvoie la valeur centrale (liste impaire)", () => {
    expect(medianeNombres([30, 10, 20])).toBe(20);
  });
  it("moyenne les deux valeurs centrales (liste paire)", () => {
    expect(medianeNombres([10, 20, 30, 40])).toBe(25);
  });
  it("ignore null / NaN et renvoie null si vide", () => {
    expect(medianeNombres([null, undefined, NaN])).toBeNull();
    expect(medianeNombres([])).toBeNull();
  });
});

describe("positionSurLigne", () => {
  it("situe le bus à l'index de son prochain arrêt", () => {
    expect(positionSurLigne(bus({ prochainStop: "C" }), ORDRE["2|0"])).toBe(2);
  });
  it("renvoie null si l'arrêt est hors desserte ou inconnu", () => {
    expect(positionSurLigne(bus({ prochainStop: "Z" }), ORDRE["2|0"])).toBeNull();
    expect(positionSurLigne(bus({}), ORDRE["2|0"])).toBeNull();
    expect(positionSurLigne(bus({ prochainStop: "A" }), null)).toBeNull();
  });
});

describe("detecterPaquets", () => {
  it("marque un bus à moins de 2 arrêts du précédent", () => {
    expect(detecterPaquets([0, 1, 5, 6])).toEqual([false, true, false, true]);
  });
  it("ne marque rien quand une position manque", () => {
    expect(detecterPaquets([0, null, 1])).toEqual([false, false, false]);
  });
});

describe("ordonnerBusLigne", () => {
  it("ordonne les bus d'un sens du départ vers le terminus", () => {
    const vehicules = [
      bus({ id: "loin", prochainStop: "F" }), // pos 5
      bus({ id: "pres", prochainStop: "B" }), // pos 1
      bus({ id: "milieu", prochainStop: "C" }), // pos 2 → collé à "pres"
    ];
    const [groupe] = ordonnerBusLigne(vehicules, "2", "tous", ORDRE);
    expect(groupe.direction).toBe("0");
    expect(groupe.bus.map((b) => b.id)).toEqual(["pres", "milieu", "loin"]);
    expect(groupe.colle).toEqual([false, true, false]);
  });

  it("bascule sur l'ETA quand la desserte de référence est absente", () => {
    const vehicules = [
      bus({ id: "tard", prochainStop: "X", arrivee: 2000 }),
      bus({ id: "tot", prochainStop: "Y", arrivee: 1000 }),
    ];
    const [groupe] = ordonnerBusLigne(vehicules, "2", "tous", {});
    expect(groupe.bus.map((b) => b.id)).toEqual(["tot", "tard"]);
  });

  it("filtre par sens quand un directionId est fourni", () => {
    const vehicules = [
      bus({ id: "a", direction: "0", prochainStop: "B" }),
      bus({ id: "b", direction: "1", prochainStop: "B" }),
    ];
    const groupes = ordonnerBusLigne(vehicules, "2", "1", ORDRE);
    expect(groupes).toHaveLength(1);
    expect(groupes[0].bus.map((b) => b.id)).toEqual(["b"]);
  });
});

describe("resumeLigne", () => {
  it("compte les bus en service, les signaux perdus et le retard médian", () => {
    const vieux = Math.floor(Date.now() / 1000) - 600; // > seuil fantôme
    const vehicules = [
      bus({ id: "a", retard: 60, prochainStop: "B" }),
      bus({ id: "b", retard: 180, prochainStop: "C" }),
      bus({ id: "c", retard: 600, horodatage: vieux, prochainStop: "D" }), // signal perdu
    ];
    const r = resumeLigne(vehicules, "2");
    expect(r.total).toBe(3);
    expect(r.enService).toBe(2);
    expect(r.fantomes).toBe(1);
    expect(r.retardMedianSec).toBe(120);
  });
});
