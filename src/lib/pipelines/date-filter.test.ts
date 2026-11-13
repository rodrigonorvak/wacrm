import { describe, expect, it } from "vitest";
import { isCreatedToday } from "./date-filter";

describe("pipeline today filter", () => {
  it("includes only the current local calendar day", () => {
    const now = new Date(2026, 10, 13, 12);
    expect(isCreatedToday(new Date(2026, 10, 13, 0).toISOString(), now)).toBe(true);
    expect(isCreatedToday(new Date(2026, 10, 13, 23, 59).toISOString(), now)).toBe(true);
    expect(isCreatedToday(new Date(2026, 10, 12, 23, 59).toISOString(), now)).toBe(false);
    expect(isCreatedToday(new Date(2026, 10, 14, 0).toISOString(), now)).toBe(false);
    expect(isCreatedToday("invalid", now)).toBe(false);
  });
});
