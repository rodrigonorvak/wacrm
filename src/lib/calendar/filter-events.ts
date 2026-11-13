import type { CalendarEvent } from "./load-calendar";

export function filterCalendarEvents(
  events: CalendarEvent[],
  options: { showDeals: boolean; showMessages: boolean; pipeline: string; search: string; locale: string },
): CalendarEvent[] {
  const query = options.search.trim().toLocaleLowerCase(options.locale);
  return events.filter((event) =>
    (event.kind === "deal"
      ? options.showDeals && (options.pipeline === "all" || event.pipelineId === options.pipeline)
      : options.showMessages) &&
    (!query || [event.name, event.subtitle, ...event.labels.map((label) => label.name)]
      .some((text) => text.toLocaleLowerCase(options.locale).includes(query))),
  );
}
