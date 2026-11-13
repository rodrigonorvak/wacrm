import { beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { InboxLeadActions } from "./inbox-lead-actions";
import { DealScheduleDialog } from "@/components/pipelines/deal-schedule-dialog";

const mocks = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: <T,>(initial: T | (() => T)) => {
      const index = mocks.cursor++;
      if (!(index in mocks.values)) {
        mocks.values[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      }
      return [
        mocks.values[index] as T,
        (value: T | ((previous: T) => T)) => {
          mocks.values[index] = typeof value === "function"
            ? (value as (previous: T) => T)(mocks.values[index] as T)
            : value;
        },
      ] as const;
    },
    useRef: <T,>(initial: T) => {
      const index = mocks.cursor++;
      if (!(index in mocks.values)) mocks.values[index] = { current: initial };
      return mocks.values[index] as { current: T };
    },
    useEffect: () => {},
  };
});

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ accountId: "account" }) }));
vi.mock("@/hooks/use-can", () => ({ useCan: () => true }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));

type Props = {
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClick?: () => void;
  onSave?: (id: string, date: string | null, time: string | null) => Promise<boolean>;
  onChange?: () => void;
  requireTime?: boolean;
  value?: string | null;
  timeValue?: string | null;
};

function elements(node: ReactNode): ReactElement<Props>[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [],
  );
}

function render() {
  mocks.cursor = 0;
  return elements(InboxLeadActions({ contactId: "contact", onDealUpdated }));
}

const onDealUpdated = vi.fn();
const deal = {
  id: "deal", title: "Lead", pipeline_id: "pipeline", stage_id: "old",
  value: 0, scheduled_date: "2026-02-01", scheduled_time: "09:30:00", labels: [], stage: null,
};

function setup(stage: { id: string; name: string; stage_type: string }, amount = "") {
  render();
  mocks.values[0] = [deal];
  mocks.values[1] = false;
  mocks.values[6] = deal.id;
  mocks.values[8] = true;
  mocks.values[9] = [stage];
  mocks.values[11] = stage.id;
  mocks.values[12] = amount;
}

function saveButton() {
  const button = render().find((element) => element.props.children === "saveStage");
  expect(button).toBeDefined();
  button?.props.onClick?.();
}

function scheduleDialog() {
  const dialog = render().find((element) => element.type === DealScheduleDialog);
  expect(dialog).toBeDefined();
  return dialog!;
}

beforeEach(() => {
  mocks.values = [];
  mocks.cursor = 0;
  mocks.error.mockReset();
  mocks.success.mockReset();
  onDealUpdated.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

describe("inbox lead stage changes", () => {
  it("moves an ordinary stage without scheduling", async () => {
    setup({ id: "next", name: "Contato", stage_type: "normal" });
    saveButton();
    await vi.waitFor(() => expect(onDealUpdated).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith("/api/deals/deal", expect.objectContaining({
      body: JSON.stringify({ stage_id: "next" }),
    }));
    expect(scheduleDialog().props.open).toBe(false);
  });

  it("requests a date and time and saves them atomically with the stage", async () => {
    setup({ id: "schedule", name: "Agendamento", stage_type: "schedule" });
    saveButton();
    expect(fetch).not.toHaveBeenCalled();
    let dialog = scheduleDialog();
    expect(dialog.props).toMatchObject({
      open: true, requireTime: true, value: "2026-02-01", timeValue: "09:30:00",
    });
    expect(await dialog.props.onSave?.("deal", "2026-04-02", "14:30")).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/deals/deal", expect.objectContaining({
      body: JSON.stringify({ stage_id: "schedule", scheduled_date: "2026-04-02", scheduled_time: "14:30" }),
    }));
    dialog.props.onChange?.();
    dialog.props.onOpenChange?.(false);
    dialog = scheduleDialog();
    expect(dialog.props).toMatchObject({ open: false, value: "2026-04-02", timeValue: "14:30" });
    expect(onDealUpdated).toHaveBeenCalledOnce();
  });

  it("returns to the stage selector when scheduling is cancelled", () => {
    setup({ id: "schedule", name: "Agendamento", stage_type: "schedule" });
    saveButton();
    scheduleDialog().props.onOpenChange?.(false);
    expect(mocks.values[8]).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not ask for a new schedule when the stage has not changed", async () => {
    setup({ id: "old", name: "Agendamento", stage_type: "schedule" });
    saveButton();
    await vi.waitFor(() => expect(onDealUpdated).toHaveBeenCalledOnce());
    expect(scheduleDialog().props.open).toBe(false);
    expect(fetch).toHaveBeenCalledWith("/api/deals/deal", expect.objectContaining({
      body: JSON.stringify({ stage_id: "old" }),
    }));
  });

  it("sends the paid amount alongside the schedule when both are required", async () => {
    setup({ id: "schedule", name: "Pago", stage_type: "schedule" }, "50");
    saveButton();
    expect(await scheduleDialog().props.onSave?.("deal", "2026-04-02", "14:30")).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/deals/deal", expect.objectContaining({
      body: JSON.stringify({
        stage_id: "schedule", value: 50, currency: "BRL", scheduled_date: "2026-04-02", scheduled_time: "14:30",
      }),
    }));
  });

  it("rejects a schedule without a date or time", async () => {
    setup({ id: "schedule", name: "Agendamento", stage_type: "schedule" });
    saveButton();
    expect(await scheduleDialog().props.onSave?.("deal", "2026-04-02", null)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("stageUpdateError");
  });

  it("keeps the scheduling dialog open on failure without updating the deal", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, text: async () => "Failed to update deal" } as Response);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    setup({ id: "schedule", name: "Agendamento", stage_type: "schedule" });
    saveButton();
    expect(await scheduleDialog().props.onSave?.("deal", "2026-04-02", "14:30")).toBe(false);
    expect(scheduleDialog().props.open).toBe(true);
    expect(mocks.error).toHaveBeenCalledWith("stageUpdateError");
    expect(onDealUpdated).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("requires and sends a paid amount for purchase stages regardless of their name", async () => {
    setup({ id: "purchase", name: "Venda", stage_type: "purchase" });
    expect(render().some((element) => element.props.children === "paidAmount")).toBe(true);
    saveButton();
    expect(mocks.error).toHaveBeenCalledWith("paidAmountRequired");
    expect(fetch).not.toHaveBeenCalled();
    mocks.values[12] = "123.45";
    saveButton();
    await vi.waitFor(() => expect(onDealUpdated).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith("/api/deals/deal", expect.objectContaining({
      body: JSON.stringify({ stage_id: "purchase", value: 123.45, currency: "BRL" }),
    }));
  });
});
