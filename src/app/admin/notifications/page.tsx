"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";

interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  account_name: string | null;
  account_id: string | null;
}

export default function AdminNotificationsPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [everyone, setEveryone] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const collected: AdminUser[] = [];
      for (let page = 1; page <= 20; page += 1) {
        const response = await fetch(`/api/platform-admin/users?page=${page}`);
        if (!response.ok) break;
        const body = (await response.json()) as { users?: AdminUser[]; hasMore?: boolean };
        collected.push(...(body.users ?? []).filter((user) => user.account_id));
        if (!body.hasMore) break;
      }
      if (!cancelled) {
        setUsers(collected);
        setLoading(false);
      }
    }
    void load().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      `${user.full_name ?? ""} ${user.email ?? ""} ${user.account_name ?? ""}`
        .toLocaleLowerCase()
        .includes(term),
    );
  }, [query, users]);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function send() {
    setSending(true);
    setFeedback(null);
    const response = await fetch("/api/platform-admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        message,
        all: everyone,
        user_ids: selected,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { sent?: number; error?: string };
    setSending(false);
    if (!response.ok) {
      setFeedback(body.error ?? "Não foi possível enviar");
      return;
    }
    setFeedback(`Enviado para ${body.sent ?? 0} usuário(s). Eles veem ao abrir o CRM.`);
    setTitle("");
    setMessage("");
    setSelected([]);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium">Enviar aviso</h2>
        <p className="mt-1 text-sm text-[#646970]">
          A mensagem aparece subindo no canto do CRM e fica na aba Notificações.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Título
          <input
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[#dcdcde] px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Mensagem
          <textarea
            value={message}
            maxLength={500}
            rows={4}
            onChange={(event) => setMessage(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[#dcdcde] px-3 py-2 text-sm"
          />
        </label>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setEveryone(true)}
            className={`rounded-full px-3 py-1.5 text-sm ${everyone ? "bg-[#1d2327] text-white" : "bg-[#f0f0f1]"}`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setEveryone(false)}
            className={`rounded-full px-3 py-1.5 text-sm ${!everyone ? "bg-[#1d2327] text-white" : "bg-[#f0f0f1]"}`}
          >
            Só alguns
          </button>
        </div>
        <button
          type="button"
          disabled={sending || !title.trim() || !message.trim() || (!everyone && selected.length === 0)}
          onClick={() => void send()}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#e10c8c] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {sending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          Enviar
        </button>
        {feedback ? <p className="mt-3 text-sm text-[#1d2327]">{feedback}</p> : null}
      </section>

      {!everyone && (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Quem recebe</h2>
            <p className="text-sm text-[#646970]">{selected.length} selecionado(s)</p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar nome, e-mail ou conta"
            className="mt-3 w-full rounded-lg border border-[#dcdcde] px-3 py-2 text-sm"
          />
          {loading ? (
            <p className="mt-4 flex items-center text-sm text-[#646970]">
              <LoaderCircle className="mr-2 size-4 animate-spin" /> Carregando usuários...
            </p>
          ) : (
            <ul className="mt-3 max-h-96 divide-y divide-[#f0f0f1] overflow-y-auto">
              {visible.map((user) => (
                <li key={user.id}>
                  <label className="flex cursor-pointer items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(user.id)}
                      onChange={() => toggle(user.id)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{user.full_name || user.email}</span>
                      <span className="block truncate text-xs text-[#646970]">
                        {user.email} · {user.account_name}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
