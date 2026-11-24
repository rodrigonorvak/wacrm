import { describe, expect, it } from "vitest";
import { compareBoardDeals, dealMatchesDateBounds, isCreatedToday, presetBounds } from "./date-filter";

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

  it("keeps a lead who just replied visible in today and at the top", () => {
    const now = new Date(2026, 10, 19, 18, 30);
    const bounds = presetBounds("today", now);
    const replied = {
      created_at: new Date(2026, 10, 18, 9).toISOString(),
      updated_at: new Date(2026, 10, 19, 18, 20).toISOString(),
      needs_attention: true,
    };
    const older = {
      created_at: new Date(2026, 10, 19, 8).toISOString(),
      updated_at: new Date(2026, 10, 19, 8).toISOString(),
      needs_attention: false,
    };
    const quietYesterday = {
      created_at: new Date(2026, 10, 18, 9).toISOString(),
      updated_at: new Date(2026, 10, 18, 12).toISOString(),
      needs_attention: false,
    };

    const stillPulsing = {
      created_at: new Date(2026, 10, 18, 9).toISOString(),
      updated_at: new Date(2026, 10, 18, 18).toISOString(),
      needs_attention: true,
    };

    expect(dealMatchesDateBounds(replied, bounds!.start, bounds!.end)).toBe(true);
    expect(dealMatchesDateBounds(stillPulsing, bounds!.start, bounds!.end)).toBe(true);
    expect(dealMatchesDateBounds(quietYesterday, bounds!.start, bounds!.end)).toBe(false);
    expect(compareBoardDeals(older, replied)).toBeGreaterThan(0);
  });

  it("shows a lead scheduled for today even when created earlier, ordered by time", () => {
    const now = new Date(2026, 10, 24, 10);
    const bounds = presetBounds("today", now)!;
    const morning = {
      created_at: new Date(2026, 10, 20, 9).toISOString(),
      scheduled_date: "2026-11-24",
      scheduled_time: "09:00",
      scheduled_due: true,
      needs_attention: false,
    };
    const afternoon = {
      created_at: new Date(2026, 10, 20, 9).toISOString(),
      scheduled_date: "2026-11-24",
      scheduled_time: "15:30",
      scheduled_due: true,
      needs_attention: false,
    };
    const createdToday = {
      created_at: new Date(2026, 10, 24, 8).toISOString(),
      needs_attention: false,
    };
    const scheduledOtherDay = {
      created_at: new Date(2026, 10, 20, 9).toISOString(),
      scheduled_date: "2026-11-20",
      scheduled_time: "10:00",
      needs_attention: false,
    };

    expect(dealMatchesDateBounds(morning, bounds.start, bounds.end)).toBe(true);
    expect(dealMatchesDateBounds(scheduledOtherDay, bounds.start, bounds.end)).toBe(false);
    expect(compareBoardDeals(createdToday, morning)).toBeGreaterThan(0);
    expect(compareBoardDeals(afternoon, morning)).toBeGreaterThan(0);
  });
});
