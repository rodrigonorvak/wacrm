import { format, formatDistance } from "date-fns";
import { describe, expect, it } from "vitest";
import { inboxDateLocale } from "./date-locale";

describe("inbox date localization", () => {
  const start = new Date(2026, 0, 10, 12, 0);
  const end = new Date(2026, 0, 10, 12, 1);

  it("uses Portuguese for relative times and dates", () => {
    const locale = inboxDateLocale("pt-BR");
    expect(formatDistance(start, end, { locale })).toBe("1 minuto");
    expect(format(start, "PPP", { locale })).toContain("janeiro");
  });

  it("keeps English and Korean localized", () => {
    expect(formatDistance(start, end, { locale: inboxDateLocale("en") })).toBe("1 minute");
    expect(formatDistance(start, end, { locale: inboxDateLocale("ko") })).toContain("분");
  });
});
