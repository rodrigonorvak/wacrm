"use client";

import { useEffect, useState } from "react";
import { CheckCircle, LoaderCircle, Mail, Phone, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const VIDEO_URL =
  "https://agencia.malybo.com.br/wp-content/uploads/2026/09/grok-video-f1bb9f33-811b-4d0c-8fc6-1752a31d7085.mp4";

export default function CompleteSignupPage() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/account-creation-request", { cache: "no-store" })
      .then(async (response) => {
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error(
            "A proteção da Vercel ainda está bloqueando a API. Desative o Vercel Authentication para o ambiente de produção.",
          );
        }
        if (!response.ok) throw new Error("Não foi possível carregar seu cadastro.");
        return response.json() as Promise<{
          request: { email: string; full_name: string; company: string; phone: string } | null;
        }>;
      })
      .then(({ request }) => {
        if (!request) throw new Error("Pedido de criação de conta não encontrado.");
        setEmail(request.email);
        setFullName(request.full_name);
        setCompany(request.company);
        setPhone(request.phone);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Não foi possível carregar seu cadastro.");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/account-creation-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, company, phone }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          "A proteção da Vercel ainda está bloqueando a API. Desative o Vercel Authentication para o ambiente de produção.",
        );
      }
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível enviar o pedido.");
      window.location.href = "/account-pending";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível enviar o pedido.");
      setSaving(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-8">
      <video autoPlay loop muted playsInline aria-hidden="true" className="fixed inset-0 h-full w-full object-cover">
        <source src={VIDEO_URL} type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <Card className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[#1e1e23]/[.82] text-white shadow-2xl backdrop-blur-xl">
        <CardHeader className="px-8 pt-8 text-center">
          <CheckCircle className="mx-auto mb-3 size-10 text-primary" />
          <CardTitle className="text-2xl text-white">Complete seu cadastro</CardTitle>
          <CardDescription className="text-gray-300">
            Precisamos de mais alguns dados para enviar seu pedido à equipe Malybo.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          {loading ? (
            <div className="flex justify-center py-8"><LoaderCircle className="size-6 animate-spin" /></div>
          ) : error && !email ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/20 p-4 text-sm text-red-200">{error}</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && <p className="rounded-xl border border-red-500/30 bg-red-500/20 p-3 text-sm text-red-200">{error}</p>}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-gray-200">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
                  <Input id="email" value={email} readOnly className="border-white/10 bg-white/10 pl-10 text-gray-300" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="fullName" className="text-gray-200">Nome completo</Label>
                <div className="relative">
                  <UserRound className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
                  <Input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} required className="border-white/10 bg-white/10 pl-10 text-white" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="company" className="text-gray-200">Empresa</Label>
                <Input id="company" value={company} onChange={(event) => setCompany(event.target.value)} required className="border-white/10 bg-white/10 text-white" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone" className="text-gray-200">Telefone</Label>
                <div className="relative">
                  <Phone className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
                  <Input id="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required className="border-white/10 bg-white/10 pl-10 text-white" />
                </div>
              </div>
              <Button type="submit" disabled={saving} className="mt-2 h-11">
                {saving ? "Enviando..." : "Enviar pedido de criação"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
