import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  errorTable: "",
  calls: [] as { table: string; method: string; args: unknown[] }[],
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from(table: string) {
      const builder: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ["select", "eq", "gte", "lt", "not", "in", "order"]) {
        builder[method] = (...args) => {
          state.calls.push({ table, method, args });
          return builder;
        };
      }
      builder.range = (start, end) => {
        state.calls.push({ table, method: "range", args: [start, end] });
        return Promise.resolve({
          data: (state.rows[table] ?? []).slice(start as number, (end as number) + 1),
          error: table === state.errorTable ? new Error("database error") : null,
        });
      };
      return builder;
    },
  }),
}));

import { loadCalendar } from "./load-calendar";

beforeEach(() => {
  state.calls = [];
  state.errorTable = "";
  state.rows = {
    pipelines: [{ id: "p1", name: "Funil" }],
    deals: [{
      id: "d1", title: "Card", pipeline_id: "p1",
      scheduled_date: "2026-11-13", scheduled_time: "09:30:00",
      contact: { name: "Ana" }, pipeline: { name: "Funil" }, stage: { name: "Reunião" },
    }],
    deal_label_links: [{ deal_id: "d1", label: { id: "l1", name: "Quente", color: "#ff0000" } }],
    scheduled_whatsapp_messages: [{
      id: "m1", label: "Retorno", scheduled_at: "2026-11-13T15:00:00.000Z",
      status: "pending", contact: { name: "Ana" },
    }],
  };
});

describe("loadCalendar", () => {
  it("loads account-scoped timed leads, labels, and active scheduled messages", async () => {
    const start = new Date(2026, 10, 13);
    const end = new Date(2026, 10, 17);
    const result = await loadCalendar("account", start, end);
    expect(result.pipelines).toEqual([{ id: "p1", name: "Funil" }]);
    expect(result.events).toEqual([
      expect.objectContaining({
        id: "d1", kind: "deal", name: "Ana", subtitle: "Funil · Reunião",
        labels: [{ id: "l1", name: "Quente", color: "#ff0000" }],
      }),
      expect.objectContaining({ id: "m1", kind: "message", name: "Ana", subtitle: "Retorno" }),
    ]);
    for (const table of ["pipelines", "deals", "deal_label_links", "scheduled_whatsapp_messages"]) {
      expect(state.calls).toContainEqual({ table, method: "eq", args: ["account_id", "account"] });
    }
    expect(state.calls).toContainEqual({ table: "deals", method: "not", args: ["scheduled_time", "is", null] });
    expect(state.calls).toContainEqual({ table: "deals", method: "lt", args: ["scheduled_date", "2026-11-17"] });
    expect(state.calls).toContainEqual({ table: "scheduled_whatsapp_messages", method: "gte", args: ["scheduled_at", start.toISOString()] });
    expect(state.calls).toContainEqual({ table: "scheduled_whatsapp_messages", method: "lt", args: ["scheduled_at", end.toISOString()] });
    expect(state.calls).toContainEqual({ table: "scheduled_whatsapp_messages", method: "in", args: ["status", ["pending", "processing", "uncertain"]] });
  });

  it("paginates beyond the Supabase row limit", async () => {
    state.rows.pipelines = Array.from({ length: 1001 }, (_, index) => ({ id: String(index), name: "Pipeline" }));
    const result = await loadCalendar("account", new Date(2026, 10, 13), new Date(2026, 10, 17));
    expect(result.pipelines).toHaveLength(1001);
    expect(state.calls).toContainEqual({ table: "pipelines", method: "range", args: [1000, 1999] });
  });

  it("surfaces query failures instead of showing an empty calendar", async () => {
    state.errorTable = "scheduled_whatsapp_messages";
    await expect(loadCalendar("account", new Date(2026, 10, 13), new Date(2026, 10, 17)))
      .rejects.toThrow("database error");
  });
});
