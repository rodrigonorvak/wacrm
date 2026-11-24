import { describe, expect, it } from "vitest";
import { isFollowUpDueToday, isScheduledDateToday } from "./follow-up";
import { compareBoardDeals, dealMatchesDateBounds, presetBounds } from "./date-filter";

describe("follow-up due day", () => {
  it("matches the local calendar day of the inserted date", () => {
    const now = new Date(2026, 10, 23, 15);
    expect(isScheduledDateToday("2026-11-23", now)).toBe(true);
    expect(isScheduledDateToday("2026-11-22", now)).toBe(false);
    expect(isFollowUpDueToday("follow_up", "2026-11-23", now)).toBe(true);
    expect(isFollowUpDueToday("lead", "2026-11-23", now)).toBe(false);
  });

  it("keeps follow-up due cards visible in Hoje and above quieter cards", () => {
    const now = new Date(2026, 10, 23, 12);
    const bounds = presetBounds("today", now)!;
    const due = {
      created_at: new Date(2026, 10, 18).toISOString(),
      scheduled_date: "2026-11-23",
      follow_up_due: true,
      needs_attention: false,
    };
    const quiet = {
      created_at: new Date(2026, 10, 23, 9).toISOString(),
      follow_up_due: false,
      needs_attention: false,
    };
    expect(dealMatchesDateBounds(due, bounds.start, bounds.end)).toBe(true);
    expect(compareBoardDeals(quiet, due)).toBeGreaterThan(0);
  });

  it("keeps any stage with scheduled_date today visible without follow_up_due flag", () => {
    const now = new Date(2026, 10, 24, 12);
    const bounds = presetBounds("today", now)!;
    const booked = {
      created_at: new Date(2026, 10, 20).toISOString(),
      scheduled_date: "2026-11-24",
      scheduled_time: "11:00",
      needs_attention: false,
    };
    expect(dealMatchesDateBounds(booked, bounds.start, bounds.end)).toBe(true);
  });
});
