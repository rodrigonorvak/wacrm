import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/pt-BR.json";
import type { Message } from "@/types";
import { MessageBubble } from "./message-bubble";

describe("failed message delivery status", () => {
  it("shows Meta's delivery failure reason on the status icon", () => {
    const message: Message = {
      id: "message-1",
      conversation_id: "conversation-1",
      sender_type: "agent",
      content_type: "template",
      content_text: "Mensagem do modelo",
      status: "failed",
      delivery_error: "Message undeliverable — code 131026",
      created_at: "2026-01-01T10:00:00Z",
    };
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        <MessageBubble message={message} />
      </NextIntlClientProvider>,
    );

    expect(markup).toContain('title="Message undeliverable — code 131026"');
  });
});
