import { describe, expect, it } from "vitest";
import { interpreterAcces, parseCsv } from "../netlify/functions/_lib/gtfs-statique.js";

describe("parseCsv", () => {
  it("respecte les virgules protégées par des guillemets", () => {
    const lignes = parseCsv('stop_id,stop_name\n1,"Gare, quai A"\n2,Église');
    expect(lignes).toEqual([
      { stop_id: "1", stop_name: "Gare, quai A" },
      { stop_id: "2", stop_name: "Église" },
    ]);
  });

  it("supporte le BOM UTF-8 et les fins de ligne Windows", () => {
    const lignes = parseCsv("﻿a,b\r\n1,2\r\n");
    expect(lignes).toEqual([{ a: "1", b: "2" }]);
  });

  it("complète les colonnes manquantes par une chaîne vide", () => {
    expect(parseCsv("a,b,c\n1,2")).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("renvoie une liste vide pour une entrée vide", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("interpreterAcces", () => {
  it("traduit le code GTFS d'accessibilité UFR", () => {
    expect(interpreterAcces("1")).toBe(true);
    expect(interpreterAcces("2")).toBe(false);
  });
  it("garde « inconnu » (null) distinct de « non accessible »", () => {
    expect(interpreterAcces("0")).toBeNull();
    expect(interpreterAcces("")).toBeNull();
    expect(interpreterAcces(undefined)).toBeNull();
  });
});
