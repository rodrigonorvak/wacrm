import { describe, expect, it } from "vitest";
import { summarizeAccountActivity } from "./account-activity";

describe("summarizeAccountActivity", () => {
  it("counts only the requested account and groups deal value by stage", () => {
    const summary = summarizeAccountActivity("a1", {
      contacts: [
        { account_id: "a1", ad: true },
        { account_id: "a1" },
        { account_id: "a2", ad: true },
      ],
      deals: [
        { account_id: "a1", value: 100, stage: "Novo" },
        { account_id: "a1", value: 250.5, stage: "Ganho" },
        { account_id: "a2", value: 999, stage: "Ganho" },
      ],
      appointments: [{ account_id: "a1" }],
      broadcasts: [
        { account_id: "a1", sent_count: 10 },
        { account_id: "a1", sent_count: 2 },
      ],
      emails: [{ account_id: "a1" }, { account_id: "a2" }],
    });

    expect(summary).toEqual({
      leads: 2,
      leads_ad: 1,
      leads_organic: 1,
      appointments: 1,
      broadcasts: 12,
      emails: 1,
      deal_value: 350.5,
      stages: [
        { name: "Novo", count: 1, value: 100 },
        { name: "Ganho", count: 1, value: 250.5 },
      ],
    });
  });
});
