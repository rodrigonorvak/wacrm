import { describe, expect, it } from "vitest";
import { filterCalendarEvents } from "./filter-events";
import type { CalendarEvent } from "./load-calendar";

const events: CalendarEvent[] = [
  { id: "deal", kind: "deal", start: new Date(), name: "Ana", subtitle: "Funil", pipelineId: "p1", labels: [{ id: "l1", name: "Quente", color: "#f00" }] },
  { id: "message", kind: "message", start: new Date(), name: "Ana", subtitle: "Retorno", labels: [] },
];
const defaults = { showDeals: true, showMessages: false, pipeline: "all", search: "", locale: "pt-BR" };

describe("calendar filters", () => {
  it("hides scheduled messages by default and shows them only when enabled", () => {
    expect(filterCalendarEvents(events, defaults).map((event) => event.id)).toEqual(["deal"]);
    expect(filterCalendarEvents(events, { ...defaults, showMessages: true }).map((event) => event.id)).toEqual(["deal", "message"]);
  });

  it("filters lead appointments by pipeline and searches label names", () => {
    expect(filterCalendarEvents(events, { ...defaults, pipeline: "other" })).toEqual([]);
    expect(filterCalendarEvents(events, { ...defaults, search: "QUENTE" }).map((event) => event.id)).toEqual(["deal"]);
  });
});
