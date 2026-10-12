"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AccountRequest {
  id: string;
  full_name: string;
  email: string;
  company: string;
  phone: string;
  status: "pending" | "approved" | "denied";
  denial_reason: string | null;
  created_at: string;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

export default function AccountRequestsPage() {
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    setFailed(false);
    try {
      const response = await fetch("/api/platform-admin/account-requests", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setDenied(true);
        return;
      }
      if (!response.ok) {
        setFailed(true);
        return;
      }
      const data = (await response.json()) as { requests: AccountRequest[] };
      setRequests(data.requests);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function decide(requestId: string, action: "approve" | "deny") {
    const confirmation = action === "approve"
      ? "Aprovar este pedido e liberar o acesso ao CRM?"
      : "Negar este pedido de criação de conta?";
    if (!window.confirm(confirmation)) return;
    setBusyId(requestId);
    try {
      const response = await fetch("/api/platform-admin/account-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Não foi possível atualizar o pedido.");
      }
      await loadRequests();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível atualizar o pedido.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">CRM Malybo</p>
            <h1 className="mt-2 text-2xl font-semibold">Pedidos de criação de conta</h1>
            <p className="mt-1 text-sm text-muted-foreground">Analise e aprove novos clientes do CRM.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadRequests()} disabled={loading}>
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Atualizar
          </Button>
        </header>
        <nav className="flex gap-5 border-b border-border text-sm" aria-label="Platform administration">
          <Link href="/admin" className="py-3 text-muted-foreground hover:text-foreground">Contas</Link>
          <Link href="/admin/requests" aria-current="page" className="border-b-2 border-primary py-3 font-medium">Pedidos de criação</Link>
          <Link href="/admin/users" className="py-3 text-muted-foreground hover:text-foreground">Usuários</Link>
        </nav>

        {denied ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <ShieldAlert className="size-8 text-amber-500" />
            <p className="text-sm text-muted-foreground">Esta conta não tem autorização para administrar a plataforma.</p>
          </div>
        ) : failed ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-destructive">Não foi possível carregar os pedidos.</div>
        ) : loading ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" />Carregando pedidos...
          </div>
        ) : requests.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">Nenhum pedido encontrado.</div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-3 pr-4 font-medium">Solicitante</th>
                  <th className="py-3 pr-4 font-medium">Empresa</th>
                  <th className="py-3 pr-4 font-medium">Telefone</th>
                  <th className="py-3 pr-4 font-medium">Data</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id} className="border-b border-border/70 align-top">
                    <td className="py-4 pr-4">
                      <p className="font-medium">{request.full_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{request.email}</p>
                    </td>
                    <td className="py-4 pr-4">{request.company}</td>
                    <td className="py-4 pr-4">{request.phone}</td>
                    <td className="py-4 pr-4 text-muted-foreground">{formatDate(request.created_at)}</td>
                    <td className="py-4 pr-4 capitalize">{request.status}</td>
                    <td className="py-4">
                      {request.status === "pending" ? (
                        <div className="flex gap-2">
                          <Button type="button" size="sm" disabled={busyId === request.id} onClick={() => void decide(request.id, "approve")}>Aprovar</Button>
                          <Button type="button" size="sm" variant="outline" disabled={busyId === request.id} onClick={() => void decide(request.id, "deny")}>Negar</Button>
                        </div>
                      ) : request.denial_reason ? (
                        <span className="text-xs text-muted-foreground">{request.denial_reason}</span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
