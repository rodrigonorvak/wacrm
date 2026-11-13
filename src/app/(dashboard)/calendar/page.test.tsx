import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/pt-BR.json";
import { CalendarScreen } from "@/components/calendar/calendar-view";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ accountId: "account" }),
}));

describe("calendar page defaults", () => {
  it("opens on the current date with four days and scheduled messages hidden", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        <CalendarScreen initialDate={new Date()} />
      </NextIntlClientProvider>,
    );
    expect(html).toContain('value="four" selected=""');
    expect(html).toContain("Mensagens programadas");
    expect(html).toContain("Agendamentos sem horário não são exibidos.");
    expect(html).toContain(new Date().toLocaleDateString("pt-BR", { dateStyle: "full" }));
    const checkboxes = html.match(/<input type="checkbox"[^>]*>/g);
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes?.[0]).toContain("checked");
    expect(checkboxes?.[1]).not.toContain("checked");
  });
});
