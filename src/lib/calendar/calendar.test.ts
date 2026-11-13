import { describe, expect, it } from "vitest";
import { addDays, appointmentDate, calendarRange, daysInRange, positionEvents, shiftCalendar } from "./calendar";
import { toDateKey } from "@/lib/schedule-date";

describe("calendar dates", () => {
  it("starts the four-day view on the selected day and crosses months", () => {
    const { start, end } = calendarRange(new Date(2026, 10, 30, 18), "four");
    expect(daysInRange(start, end).map(toDateKey)).toEqual([
      "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03",
    ]);
  });

  it("uses complete weeks for month view and navigates calendar months", () => {
    const range = calendarRange(new Date(2026, 10, 13), "month");
    expect(toDateKey(range.start)).toBe("2026-11-01");
    expect(toDateKey(range.end)).toBe("2026-12-06");
    expect(toDateKey(shiftCalendar(new Date(2026, 0, 31), "month", 1))).toBe("2026-02-01");
  });

  it("omits missing and invalid appointment times", () => {
    expect(appointmentDate("2026-11-13", null)).toBeNull();
    expect(appointmentDate("2026-02-30", "09:00")).toBeNull();
    expect(appointmentDate("2026-11-13", "24:00")).toBeNull();
    expect(appointmentDate("2026-11-13", "09:30:00")?.getHours()).toBe(9);
    expect(toDateKey(addDays(new Date(2026, 11, 31), 1))).toBe("2027-01-01");
  });
});

describe("calendar event positioning", () => {
  it("places simultaneous events side by side and reuses columns afterward", () => {
    const events = [
      { id: "a", start: new Date(2026, 10, 13, 9) },
      { id: "b", start: new Date(2026, 10, 13, 9, 15) },
      { id: "c", start: new Date(2026, 10, 13, 12) },
    ];
    expect(positionEvents(events).map(({ column, columns }) => [column, columns])).toEqual([
      [0, 2], [1, 2], [0, 1],
    ]);
  });

  it("keeps overlapping late-night markers in separate columns", () => {
    const events = [
      { id: "a", start: new Date(2026, 10, 13, 23, 30) },
      { id: "b", start: new Date(2026, 10, 13, 23, 55) },
    ];
    expect(positionEvents(events).map(({ column, columns, top }) => [column, columns, top])).toEqual([
      [0, 2, 1488], [1, 2, 1488],
    ]);
  });
});
