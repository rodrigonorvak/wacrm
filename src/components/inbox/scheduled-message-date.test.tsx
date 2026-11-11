import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { ScheduledMessageDialog } from "./scheduled-message-dialog";
import { ScheduleDateTimeFields } from "@/components/ui/schedule-date-time-fields";
import { Button } from "@/components/ui/button";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: <T,>(initial: T | (() => T)) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) {
        hooks.values[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      }
      return [
        hooks.values[index] as T,
        (value: T | ((previous: T) => T)) => {
          hooks.values[index] = typeof value === "function"
            ? (value as (previous: T) => T)(hooks.values[index] as T)
            : value;
        },
      ] as const;
    },
    useEffect: () => {},
    useCallback: <T,>(callback: T) => callback,
    useMemo: <T,>(factory: () => T) => factory(),
    useId: () => "time-id",
  };
});

vi.mock("next-intl", () => ({
  useLocale: () => "pt-BR",
  useTranslations: () => (key: string, values?: { count?: number }) =>
    key === "months" ? `${values?.count} meses` : key,
}));
vi.mock("@/hooks/use-can", () => ({ useCan: () => true }));
vi.mock("@/components/settings/template-manager", () => ({ TemplateManager: () => null }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
  }),
}));

type Props = {
  children?: ReactNode;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  disabled?: boolean;
  type?: string;
  onClick?: () => void | Promise<void>;
  onChange?: (event: { target: { value: string } }) => void;
  month?: Date;
  date?: string | null;
  time?: string;
  onDateChange?: (date: string) => void;
  onTimeChange?: (time: string) => void;
};

function elements(node: ReactNode): ReactElement<Props>[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [],
  );
}

function renderDialog() {
  hooks.cursor = 0;
  return elements(ScheduledMessageDialog({ contactId: "contact", contactName: "Bia" }));
}

beforeEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("scheduled message date and time", () => {
  it("uses the shared calendar and applies the six-month shortcut", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 11, 16, 24));
    const initial = renderDialog();
    initial.find((element) => element.type === Button && element.props.children === "6 meses")?.props.onClick?.();
    const updated = renderDialog();
    const fields = updated.find((element) => element.type === ScheduleDateTimeFields);
    expect(fields?.props.date).toBe("2027-05-11");
    expect(fields?.props.time).toBe("16:24");
    expect(fields?.props.month).toEqual(new Date(2027, 4, 1));
  });

  it("requires both fields and submits the selected local time as UTC", async () => {
    renderDialog();
    hooks.values[6] = "template";
    hooks.values[7] = "Retorno";
    hooks.values[8] = "2027-05-11";
    hooks.values[9] = "";
    expect(renderDialog().find((element) => element.type === Button && element.props.children === "submit")?.props.disabled).toBe(true);

    hooks.values[9] = "16:24";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "schedule" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ schedules: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    renderDialog().find((element) => element.type === Button && element.props.children === "submit")?.props.onClick?.();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const request = fetchMock.mock.calls[0][1] as { body: string };
    expect(JSON.parse(request.body)).toMatchObject({
      contact_id: "contact", template_id: "template", label: "Retorno",
      scheduled_at: new Date("2027-05-11T16:24").toISOString(),
    });
    expect(renderDialog().find((element) => element.type === ScheduleDateTimeFields)?.props)
      .toMatchObject({ date: null, time: "" });
  });

  it("calendar controls select a date and time and navigate months", () => {
    const onMonthChange = vi.fn();
    const onDateChange = vi.fn();
    const onTimeChange = vi.fn();
    const tree = elements(ScheduleDateTimeFields({
      month: new Date(2026, 10, 1), onMonthChange,
      date: "2026-11-11", onDateChange, time: "", onTimeChange, requireTime: true,
    }));
    const selected = tree.find((element) => element.type === "button" && element.props["aria-pressed"] === true);
    expect(selected?.props.children).toBe(11);
    tree.find((element) => element.type === "button" && element.props.children === 12)?.props.onClick?.();
    expect(onDateChange).toHaveBeenCalledWith("2026-11-12");
    tree.find((element) => element.type === Button && element.props["aria-label"] === "nextMonth")?.props.onClick?.();
    expect(onMonthChange).toHaveBeenCalledWith(new Date(2026, 11, 1));
    tree.find((element) => element.type === "input" && element.props.type === "time")?.props.onChange?.({ target: { value: "09:30" } });
    expect(onTimeChange).toHaveBeenCalledWith("09:30");
  });
});
