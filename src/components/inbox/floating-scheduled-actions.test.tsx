import { beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { InboxLeadActions } from "./inbox-lead-actions";
import { LeadQuickActions } from "@/components/pipelines/lead-quick-actions";
import { ScheduledMessageDialog } from "./scheduled-message-dialog";

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
  };
});

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key === "title" ? "Mensagem programada" : key,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ accountId: "account" }) }));
vi.mock("@/hooks/use-can", () => ({ useCan: () => false }));
vi.mock("./scheduled-message-dialog", () => ({ ScheduledMessageDialog: () => null }));

type ElementProps = {
  children?: ReactNode;
  "aria-label"?: string;
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
  contactId?: string;
  contactName?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function findElements(node: ReactNode): ReactElement<ElementProps>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<ElementProps>(child)) return [];
    return [child, ...findElements(child.props.children)];
  });
}

function renderInbox() {
  hooks.cursor = 0;
  return findElements(InboxLeadActions({ contactId: "contact", contactName: "Bia" }));
}

function renderCard(contactId: string | null) {
  hooks.cursor = 0;
  const noop = () => {};
  return findElements(LeadQuickActions({
    canManageLead: false,
    phone: null,
    conversationId: null,
    contactId,
    contactName: "Bia",
    onAddNote: noop,
    onScheduleAlert: noop,
    onChangeStage: noop,
    onEditInformation: noop,
    onServiceSteps: noop,
    onEditLabels: noop,
    onEditSchedule: noop,
    onDeleteLead: noop,
  }));
}

beforeEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
});

describe("floating scheduled message actions", () => {
  it("opens and closes the contact's dialog in the inbox without a linked deal", () => {
    let elements = renderInbox();
    elements.find((element) => element.props["aria-label"] === "openActions")?.props.onClick?.();
    elements = renderInbox();
    expect(elements.some((element) => element.props.children === "changeStage")).toBe(false);
    const action = elements.find((element) => element.type === "button" &&
      findElements(element.props.children).some((child) => child.props.children === "Mensagem programada"));
    expect(action).toBeDefined();
    action?.props.onClick?.();
    elements = renderInbox();
    const dialog = elements.find((element) => element.type === ScheduledMessageDialog);
    expect(dialog?.props).toMatchObject({ contactId: "contact", contactName: "Bia", open: true });
    expect(elements.some((element) => element.props["aria-label"] === "openActions")).toBe(true);
    dialog?.props.onOpenChange?.(false);
    expect(renderInbox().find((element) => element.type === ScheduledMessageDialog)?.props.open).toBe(false);
  });

  it("opens the same dialog from the card even when lead editing is unavailable", () => {
    let elements = renderCard("contact");
    elements.find((element) => element.props["aria-label"] === "Abrir ações do lead")?.props.onClick?.();
    elements = renderCard("contact");
    const action = elements.find((element) => element.props.title === "Mensagem programada");
    expect(action?.props.disabled).toBe(false);
    action?.props.onClick?.();
    elements = renderCard("contact");
    expect(elements.find((element) => element.type === ScheduledMessageDialog)?.props)
      .toMatchObject({ contactId: "contact", contactName: "Bia", open: true });
    expect(elements.some((element) => element.props["aria-label"] === "Abrir ações do lead")).toBe(true);
  });

  it("preserves the deal actions and their permissions in the inbox", () => {
    renderInbox();
    hooks.values[0] = [{ id: "deal", labels: [] }];
    hooks.values[1] = false;
    renderInbox().find((element) => element.props["aria-label"] === "openActions")?.props.onClick?.();
    const buttons = renderInbox().filter((element) => element.type === "button");
    const stage = buttons.find((button) => findElements(button.props.children).some((child) => child.props.children === "changeStage"));
    const labels = buttons.find((button) => findElements(button.props.children).some((child) => child.props.children === "editLabels"));
    expect(stage?.props.disabled).toBe(true);
    expect(labels?.props.disabled).toBe(true);
  });

  it("disables scheduling on a card without a linked contact", () => {
    renderCard(null).find((element) => element.props["aria-label"] === "Abrir ações do lead")?.props.onClick?.();
    const elements = renderCard(null);
    expect(elements.find((element) => element.props.title === "Mensagem programada")?.props.disabled).toBe(true);
    expect(elements.some((element) => element.type === ScheduledMessageDialog)).toBe(false);
  });
});
