import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import type { Deal } from "@/types";
import { DealCard } from "./deal-card";

const messages = {
  AdSource: { advertisement: "Anúncio" },
  ScheduledMessages: { indicator: "Mensagem programada" },
  Pipelines: { list: { firstRespondedBy: "Respondido por {name}" } },
};

function render(hasAdReferral: boolean, source?: string) {
  const deal = {
    id: "deal", title: "Contato", created_at: "2026-01-01T12:00:00Z",
    contact: { id: "contact", has_ad_referral: hasAdReferral },
    source,
  } as Deal;
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <DealCard deal={deal} onEdit={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("pipeline ad indicator", () => {
  it("shows the ad badge before the lead name", () => {
    const html = render(true);
    expect(html).toContain("Anúncio");
    expect(html.indexOf("Anúncio")).toBeLessThan(html.indexOf("Contato"));
  });
  it("does not display an organic badge", () => {
    const html = render(false, "Orgânico");
    expect(html).not.toContain("Anúncio");
    expect(html).not.toContain("Orgânico");
  });
  it("preserves other sources", () => {
    expect(render(false, "Site")).toContain("Site");
  });
});
