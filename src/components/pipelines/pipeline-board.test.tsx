import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import type { PipelineStage } from "@/types";
import { PipelineBoard } from "./pipeline-board";

vi.mock("@/hooks/use-scheduled-contacts", () => ({
  useScheduledContacts: () => new Set<string>(),
}));

describe("pipeline stage headings", () => {
  it("renders the full stage name without truncation and allows long words to wrap", () => {
    const name = "Aguardando Atendimento Humano ComNomeMuitoComprido";
    const stage: PipelineStage = {
      id: "stage", pipeline_id: "pipeline", name, position: 0, color: "", created_at: "2026-01-01",
    };
    const noop = () => {};
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="pt-BR" messages={{ Pipelines: { board: {}, stageTypes: {} } }}>
        <PipelineBoard
          stages={[stage]}
          deals={[]}
          visibleCardFields={[]}
          canEditStageColors={false}
          onStageColorChange={noop}
          onStageTypeChange={noop}
          onDealMoved={noop}
          onAddDeal={noop}
          onEditDeal={noop}
        />
      </NextIntlClientProvider>,
    );
    const heading = html.match(/<h3\b[^>]*>[^<]*<\/h3>/)?.[0];
    expect(heading).toContain(name);
    expect(heading).toContain("break-words");
    expect(heading).not.toContain("truncate");
  });
});
