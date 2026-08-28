import { describe, expect, it } from "vitest";
import protobuf from "gtfs-realtime-bindings";
import { extraireAlertes, texteTraduit } from "../netlify/functions/bus-data.js";

const { FeedMessage } = protobuf.transit_realtime;

// Encode puis décode un vrai flux : c'est le décodage protobuf qui fixe la forme
// des champs (enum en nombre, Long pour les timestamps…).
function flux(entites) {
  return FeedMessage.decode(
    FeedMessage.encode(
      FeedMessage.fromObject({
        header: { gtfsRealtimeVersion: "2.0", timestamp: Math.floor(Date.now() / 1000) },
        entity: entites,
      })
    ).finish()
  );
}

const NOMS = { _500: "Place Salengro" };

describe("extraireAlertes", () => {
  const t = Math.floor(Date.now() / 1000);

  it("extrait une alerte active, son effet lisible, ses lignes et arrêts", () => {
    const feed = flux([
      {
        id: "42",
        alert: {
          activePeriod: [{ start: t - 3600, end: t + 3600 }],
          informedEntity: [{ routeId: "2" }, { stopId: "_500" }],
          effect: "DETOUR",
          headerText: { translation: [{ text: "Déviation ligne 2", language: "fr" }] },
          descriptionText: { translation: [{ text: "Travaux avenue de la Mer" }] },
        },
      },
    ]);

    const alertes = extraireAlertes(feed, NOMS);
    expect(alertes).toHaveLength(1);
    expect(alertes[0].effet).toBe("Déviation");
    expect(alertes[0].titre).toBe("Déviation ligne 2");
    expect(alertes[0].lignes).toEqual(["2"]);
    expect(alertes[0].arrets).toEqual([{ stopId: "_500", nom: "Place Salengro" }]);
  });

  it("ignore une alerte dont la période est entièrement passée", () => {
    const feed = flux([
      {
        id: "43",
        alert: {
          activePeriod: [{ start: t - 7200, end: t - 3600 }],
          informedEntity: [{ routeId: "3" }],
          headerText: { translation: [{ text: "Ancienne info" }] },
        },
      },
    ]);
    expect(extraireAlertes(feed, NOMS)).toHaveLength(0);
  });

  it("considère active une alerte sans période", () => {
    const feed = flux([
      {
        id: "44",
        alert: {
          informedEntity: [{ routeId: "1" }],
          headerText: { translation: [{ text: "Info permanente" }] },
        },
      },
    ]);
    expect(extraireAlertes(feed, NOMS)).toHaveLength(1);
  });

  it("n'émet rien pour une entité sans texte", () => {
    const feed = flux([
      { id: "45", alert: { informedEntity: [{ routeId: "1" }] } },
    ]);
    expect(extraireAlertes(feed, NOMS)).toHaveLength(0);
  });
});

describe("texteTraduit", () => {
  it("préfère le français puis retombe sur la première traduction", () => {
    expect(
      texteTraduit({
        translation: [
          { text: "Detour", language: "en" },
          { text: "Déviation", language: "fr" },
        ],
      })
    ).toBe("Déviation");
    expect(texteTraduit({ translation: [{ text: "Seulement EN", language: "en" }] })).toBe(
      "Seulement EN"
    );
    expect(texteTraduit(null)).toBe("");
  });
});
