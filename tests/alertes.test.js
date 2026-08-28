import { describe, expect, it } from "vitest";
import protobuf from "gtfs-realtime-bindings";
import { minutesAvantPassage } from "../netlify/functions/verifier-alertes.mjs";

const { FeedMessage } = protobuf.transit_realtime;

// Fabrique un flux GTFS-RT réel (encodé puis décodé) plutôt qu'un objet factice :
// c'est le décodage protobuf qui décide de la forme exacte des champs lus.
function fluxDeTest() {
  const t = Math.floor(Date.now() / 1000);
  return FeedMessage.decode(
    FeedMessage.encode(
      FeedMessage.fromObject({
        header: { gtfsRealtimeVersion: "2.0", timestamp: t },
        entity: [
          {
            id: "1",
            tripUpdate: {
              trip: { tripId: "A", routeId: "3", directionId: 0 },
              stopTimeUpdate: [
                { stopId: "_100", arrival: { time: t + 60 * 12 } },
                { stopId: "_200", arrival: { time: t + 60 * 20 } },
              ],
            },
          },
          {
            id: "2",
            tripUpdate: {
              trip: { tripId: "B", routeId: "3", directionId: 0 },
              stopTimeUpdate: [{ stopId: "_100", arrival: { time: t + 60 * 4 } }],
            },
          },
          {
            id: "3",
            tripUpdate: {
              trip: { tripId: "C", routeId: "3", directionId: 1 },
              stopTimeUpdate: [{ stopId: "_100", arrival: { time: t + 60 } }],
            },
          },
          {
            id: "4",
            tripUpdate: {
              trip: { tripId: "D", routeId: "3", directionId: 0 },
              stopTimeUpdate: [{ stopId: "_100", departure: { time: t - 60 * 30 } }],
            },
          },
        ],
      })
    ).finish()
  );
}

describe("minutesAvantPassage", () => {
  const feed = fluxDeTest();

  it("retient la course la plus proche du sens demandé", () => {
    const eta = minutesAvantPassage(feed, { routeId: "3", direction: "0", stopId: "_100" });
    expect(Math.round(eta)).toBe(4);
  });

  it("ne mélange pas les deux sens", () => {
    const eta = minutesAvantPassage(feed, { routeId: "3", direction: "1", stopId: "_100" });
    expect(Math.round(eta)).toBe(1);
  });

  it("accepte les deux sens quand la direction est vide", () => {
    const eta = minutesAvantPassage(feed, { routeId: "3", direction: "", stopId: "_100" });
    expect(Math.round(eta)).toBe(1);
  });

  it("ignore un passage déjà écoulé", () => {
    // La course D est passée il y a 30 min : elle ne doit jamais être retenue
    const eta = minutesAvantPassage(feed, { routeId: "3", direction: "0", stopId: "_100" });
    expect(eta).toBeGreaterThan(0);
  });

  it("renvoie null pour une ligne ou un arrêt inconnus", () => {
    expect(minutesAvantPassage(feed, { routeId: "99", direction: "0", stopId: "_100" })).toBeNull();
    expect(minutesAvantPassage(feed, { routeId: "3", direction: "0", stopId: "_x" })).toBeNull();
  });
});
