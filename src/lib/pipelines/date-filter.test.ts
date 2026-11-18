import { describe, expect, it } from "vitest";
import { isCreatedToday, presetBounds } from "./date-filter";

describe("pipeline today filter", () => {
  it("includes only the current local calendar day", () => {
    const now = new Date(2026, 10, 13, 12);
    expect(isCreatedToday(new Date(2026, 10, 13, 0).toISOString(), now)).toBe(true);
    expect(isCreatedToday(new Date(2026, 10, 13, 23, 59).toISOString(), now)).toBe(true);
    expect(isCreatedToday(new Date(2026, 10, 12, 23, 59).toISOString(), now)).toBe(false);
    expect(isCreatedToday(new Date(2026, 10, 14, 0).toISOString(), now)).toBe(false);
    expect(isCreatedToday("invalid", now)).toBe(false);
  });

  it("covers a single day and the Meta presets", () => {
    const now = new Date(2026, 10, 18, 15);
    const yesterday = presetBounds("yesterday", now);
    expect(yesterday?.start.getDate()).toBe(17);
    expect(yesterday?.end.getDate()).toBe(17);

    const last7 = presetBounds("7", now);
    expect(last7?.start.getDate()).toBe(12);
    expect(last7?.end.getDate()).toBe(18);

    const lastWeek = presetBounds("last_week", now);
    expect(lastWeek?.start.getDate()).toBe(9);
    expect(lastWeek?.end.getDate()).toBe(15);

    expect(presetBounds("max", now)).toBeNull();
  });
});
