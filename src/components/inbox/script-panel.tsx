"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpenText, LoaderCircle } from "lucide-react";
import { applyScriptName, SCRIPT_BASE_CSS } from "@/lib/scripts/defaults";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export type ConversationScript = {
  id: string;
  title: string;
  html_content: string;
  css_content: string;
  position: number;
};

interface ScriptPanelProps {
  contactName?: string | null;
  onUseLine: (text: string) => void;
  onClose: () => void;
  autoOpen?: boolean;
}

export function ScriptPanel({
  contactName,
  onUseLine,
  onClose,
  autoOpen = false,
}: ScriptPanelProps) {
  const [scripts, setScripts] = useState<ConversationScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<ConversationScript | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const response = await fetch("/api/scripts");
        if (!response.ok) throw new Error("failed");
        const body = (await response.json()) as { scripts: ConversationScript[] };
        if (cancelled) return;
        setScripts(body.scripts ?? []);
        if (autoOpen && (body.scripts?.length ?? 0) === 1) {
          setActive(body.scripts[0]);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoOpen]);

  const scopedCss = useMemo(() => {
    if (!active) return "";
    return `${SCRIPT_BASE_CSS}\n${active.css_content || ""}`;
  }, [active]);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root || !active) return;

    const nodes = root.querySelectorAll<HTMLElement>("[data-script-msg]");
    const cleanups: Array<() => void> = [];

    nodes.forEach((node) => {
      if (node.querySelector("[data-script-use]")) return;
      const raw = node.getAttribute("data-script-msg") ?? node.textContent ?? "";
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.scriptUse = "1";
      button.textContent = "Usar";
      button.className =
        "mt-2 inline-flex items-center rounded-md bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/30";
      const onClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onUseLine(applyScriptName(raw, contactName));
      };
      button.addEventListener("click", onClick);
      node.appendChild(button);
      cleanups.push(() => {
        button.removeEventListener("click", onClick);
        button.remove();
      });
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [active, contactName, onUseLine]);

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-white lg:w-80 xl:w-96">
      <header className="flex items-center gap-2 border-b border-border px-3 py-3">
        {active ? (
          <button
            type="button"
            onClick={() => setActive(null)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Scripts
          </button>
        ) : (
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <BookOpenText className="size-4 text-primary" />
            Scripts
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Fechar
        </button>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Carregando scripts...
        </div>
      ) : failed ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
          <p className="text-sm text-muted-foreground">Não foi possível carregar os scripts.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
            Tentar de novo
          </Button>
        </div>
      ) : !active ? (
        <ScrollArea className="flex-1">
          <div className="space-y-2 p-3">
            {scripts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum script cadastrado ainda.
              </p>
            ) : (
              scripts.map((script) => (
                <button
                  key={script.id}
                  type="button"
                  onClick={() => setActive(script)}
                  className="flex w-full items-center justify-between rounded-xl border border-[#e6ebf2] bg-[#f7f9fc] px-3 py-3 text-left hover:border-primary/40"
                >
                  <span className="text-sm font-semibold text-foreground">{script.title}</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-3">
            <p className="mb-3 text-base font-bold text-foreground">{active.title}</p>
            <style dangerouslySetInnerHTML={{ __html: scopedCss }} />
            <div
              ref={bodyRef}
              className="script-panel-body"
              dangerouslySetInnerHTML={{ __html: active.html_content }}
            />
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
