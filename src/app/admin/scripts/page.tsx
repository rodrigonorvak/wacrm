"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type AccountOption = { id: string; name: string };
type ScriptRow = {
  id: string;
  account_id: string;
  title: string;
  html_content: string;
  css_content: string;
  position: number;
  is_active: boolean;
};

export default function AdminScriptsPage() {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [scripts, setScripts] = useState<ScriptRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [cssContent, setCssContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/platform-admin/overview?from=1970-01-01T00:00:00.000Z", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          accounts: Array<{ id: string; name: string }>;
        };
        const list = (data.accounts ?? []).map((account) => ({
          id: account.id,
          name: account.name,
        }));
        setAccounts(list);
        if (list[0]) setAccountId(list[0].id);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadScripts = useCallback(async (id: string) => {
    if (!id) return;
    const response = await fetch(`/api/platform-admin/scripts?account_id=${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      toast.error("Não foi possível carregar os scripts.");
      return;
    }
    const data = (await response.json()) as { scripts: ScriptRow[] };
    setScripts(data.scripts ?? []);
    const first = data.scripts?.[0];
    if (first) {
      setSelectedId(first.id);
      setTitle(first.title);
      setHtmlContent(first.html_content);
      setCssContent(first.css_content);
    } else {
      setSelectedId(null);
      setTitle("");
      setHtmlContent("");
      setCssContent("");
    }
  }, []);

  useEffect(() => {
    if (accountId) void loadScripts(accountId);
  }, [accountId, loadScripts]);

  function selectScript(script: ScriptRow) {
    setSelectedId(script.id);
    setTitle(script.title);
    setHtmlContent(script.html_content);
    setCssContent(script.css_content);
  }

  async function save() {
    if (!accountId || !title.trim()) {
      toast.error("Informe o título do script.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/platform-admin/scripts", {
        method: selectedId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          selectedId
            ? {
                id: selectedId,
                title,
                html_content: htmlContent,
                css_content: cssContent,
              }
            : {
                account_id: accountId,
                title,
                html_content: htmlContent,
                css_content: cssContent,
                position: scripts.length,
              },
        ),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error || "Não foi possível salvar.");
        return;
      }
      toast.success("Script salvo.");
      await loadScripts(accountId);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#50575e]">
        <LoaderCircle className="size-4 animate-spin" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[#1d2327]">Scripts de atendimento</h1>
        <p className="mt-1 text-sm text-[#50575e]">
          Cadastre HTML/CSS por conta. Use <code>data-script-msg=&quot;texto&quot;</code> nos balões
          que o atendente poderá enviar com o botão Usar.
        </p>
      </div>

      <div className="grid gap-2 max-w-md">
        <Label htmlFor="script-account">Conta do CRM</Label>
        <select
          id="script-account"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          className="h-10 rounded-md border border-[#c3c4c7] bg-white px-3 text-sm"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-2 rounded-lg border border-[#dcdcde] bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Scripts</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedId(null);
                setTitle("");
                setHtmlContent("");
                setCssContent("");
              }}
            >
              Novo
            </Button>
          </div>
          {scripts.map((script) => (
            <button
              key={script.id}
              type="button"
              onClick={() => selectScript(script)}
              className={
                selectedId === script.id
                  ? "w-full rounded-md bg-[#1d2327] px-3 py-2 text-left text-sm text-white"
                  : "w-full rounded-md px-3 py-2 text-left text-sm text-[#1d2327] hover:bg-[#f0f0f1]"
              }
            >
              {script.title}
            </button>
          ))}
        </aside>

        <section className="space-y-3 rounded-lg border border-[#dcdcde] bg-white p-4">
          <div className="grid gap-2">
            <Label htmlFor="script-title">Título</Label>
            <Input id="script-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="script-html">HTML</Label>
            <Textarea
              id="script-html"
              value={htmlContent}
              onChange={(event) => setHtmlContent(event.target.value)}
              className="min-h-[280px] font-mono text-xs"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="script-css">CSS (opcional)</Label>
            <Textarea
              id="script-css"
              value={cssContent}
              onChange={(event) => setCssContent(event.target.value)}
              className="min-h-[120px] font-mono text-xs"
            />
          </div>
          <Button type="button" onClick={() => void save()} disabled={saving} className="gap-2">
            <Save className="size-4" />
            {saving ? "Salvando..." : "Salvar script"}
          </Button>
        </section>
      </div>
    </div>
  );
}
