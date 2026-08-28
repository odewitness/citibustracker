import { describe, expect, it } from "vitest";
import {
  agePosition,
  busFantome,
  categorieRetard,
  construireLien,
  distanceMetres,
  estLignePrincipale,
  formaterDistance,
  formaterRetard,
  lireParametresUrl,
  normaliserTexte,
  prochainsPassages,
  trierParNom,
} from "../src/utils.js";

describe("normaliserTexte", () => {
  it("ignore accents, casse et espaces de bord", () => {
    expect(normaliserTexte("  Église Saint-Paul ")).toBe("eglise saint-paul");
    expect(normaliserTexte("GARE SNCF")).toBe("gare sncf");
  });
  it("tolère les valeurs vides", () => {
    expect(normaliserTexte(null)).toBe("");
  });
});

describe("distanceMetres", () => {
  it("mesure une distance connue à quelques mètres près", () => {
    // Deux points distants d'environ 1 km au sud de Narbonne
    const d = distanceMetres(43.18, 3.0, 43.189, 3.0);
    expect(d).toBeGreaterThan(950);
    expect(d).toBeLessThan(1050);
  });
  it("vaut zéro pour le même point", () => {
    expect(distanceMetres(43.18, 3.0, 43.18, 3.0)).toBe(0);
  });
});

describe("formaterDistance", () => {
  it("arrondit les mètres à la dizaine et passe au km au-delà de 1000", () => {
    expect(formaterDistance(123)).toBe("120 m");
    expect(formaterDistance(2450)).toBe("2,5 km");
  });
});

describe("formaterRetard", () => {
  it("distingue à l'heure, secondes et minutes", () => {
    expect(formaterRetard(5)).toBe("à l'heure");
    expect(formaterRetard(45)).toBe("retard de 45 s");
    expect(formaterRetard(-45)).toBe("avance de 45 s");
    expect(formaterRetard(150)).toBe("retard de 3 min");
    expect(formaterRetard(null)).toBeNull();
  });
});

describe("estLignePrincipale", () => {
  it("reconnaît les lignes urbaines quelle que soit leur écriture", () => {
    expect(estLignePrincipale("1")).toBe(true);
    expect(estLignePrincipale({ nom: "CIT 1" })).toBe(true);
    expect(estLignePrincipale("cit-2")).toBe(true);
    expect(estLignePrincipale("S12")).toBe(false);
  });
});

describe("trierParNom", () => {
  it("trie 2 avant 10 (tri naturel)", () => {
    const lignes = { a: { nom: "10" }, b: { nom: "2" }, c: { nom: "S3" } };
    expect(trierParNom(["a", "b", "c"], lignes)).toEqual(["b", "a", "c"]);
  });
});

describe("categorieRetard", () => {
  it("classe l'avance, l'heure, le retard léger et le retard fort", () => {
    expect(categorieRetard(null)).toBe("inconnu");
    expect(categorieRetard(-120)).toBe("avance");
    expect(categorieRetard(0)).toBe("heure");
    expect(categorieRetard(45)).toBe("heure");
    expect(categorieRetard(180)).toBe("leger");
    expect(categorieRetard(600)).toBe("fort");
  });
});

describe("agePosition / busFantome", () => {
  const maintenant = 1_700_000_000_000;
  it("mesure l'âge d'une position et repère un flux figé", () => {
    expect(agePosition({ horodatage: maintenant / 1000 - 30 }, maintenant)).toBe(30);
    expect(busFantome({ horodatage: maintenant / 1000 - 30 }, maintenant)).toBe(false);
    expect(busFantome({ horodatage: maintenant / 1000 - 600 }, maintenant)).toBe(true);
  });
  it("tolère l'absence d'horodatage", () => {
    expect(agePosition({}, maintenant)).toBeNull();
    expect(busFantome({}, maintenant)).toBe(false);
  });
});

describe("construireLien / lireParametresUrl", () => {
  it("construit un lien profond et le relit à l'identique", () => {
    const lien = construireLien("https://x.fr/", {
      ligne: "2",
      sens: "0",
      arret: "ABC",
      action: "alerte",
    });
    expect(lien).toBe("https://x.fr/?ligne=2&sens=0&arret=ABC&action=alerte");
    expect(lireParametresUrl("?ligne=2&sens=0&arret=ABC&action=alerte")).toEqual({
      ligne: "2",
      sens: "0",
      arret: "ABC",
      action: "alerte",
    });
  });
  it("omet les paramètres vides", () => {
    expect(construireLien("https://x.fr/", { ligne: "3" })).toBe("https://x.fr/?ligne=3");
    expect(construireLien("https://x.fr/", {})).toBe("https://x.fr/");
  });
});

describe("prochainsPassages", () => {
  const maintenant = Date.now();
  const dans = (minutes) => Math.round((maintenant + minutes * 60000) / 1000);
  const vehicules = [
    {
      ligne: "3",
      destination: "Réveillon",
      prochains_arrets: [
        { stop_id: "_1", arrivee: dans(12), retard: 60 },
        { stop_id: "_2", arrivee: dans(20), retard: null },
      ],
    },
    { ligne: "4", destination: "Crabit", prochains_arrets: [{ stop_id: "_1", arrivee: dans(3) }] },
    { ligne: "9", destination: "Passé", prochains_arrets: [{ stop_id: "_1", arrivee: dans(-30) }] },
    { ligne: "8", destination: "Sans horaire", prochains_arrets: [{ stop_id: "_1", arrivee: null }] },
  ];

  it("classe par imminence et ignore les passages écoulés ou sans horaire", () => {
    const passages = prochainsPassages("_1", vehicules);
    expect(passages.map((p) => p.ligne)).toEqual(["4", "3"]);
    expect(passages[0].eta).toBe(3);
  });

  it("ne renvoie rien pour un arrêt non desservi", () => {
    expect(prochainsPassages("_inconnu", vehicules)).toEqual([]);
  });

  it("tolère un véhicule sans liste d'arrêts", () => {
    expect(prochainsPassages("_1", [{ ligne: "1" }])).toEqual([]);
  });
});
