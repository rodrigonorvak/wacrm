"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { LogIn, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

const VIDEO_URL =
  "https://agencia.malybo.com.br/wp-content/uploads/2026/09/grok-video-f1bb9f33-811b-4d0c-8fc6-1752a31d7085.mp4";

const MESSAGES = {
  deleted: {
    title: "Conta excluída",
    description: "Esta conta foi excluída e não pode mais acessar o CRM.",
  },
  suspended: {
    title: "Conta desativada temporariamente",
    description: "O acesso desta conta está temporariamente desativado. Entre em contato com a equipe Malybo.",
  },
  denied: {
    title: "Cadastro não aprovado",
    description: "O pedido de criação desta conta não foi aprovado pela equipe Malybo.",
  },
  unavailable: {
    title: "Acesso indisponível",
    description: "Não encontramos uma conta ativa para este usuário.",
  },
} as const;

export default function AccountStatusPage() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const message = reason && reason in MESSAGES
    ? MESSAGES[reason as keyof typeof MESSAGES]
    : MESSAGES.unavailable;

  useEffect(() => {
    void createClient().auth.signOut();
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-8">
      <video autoPlay loop muted playsInline aria-hidden="true" className="fixed inset-0 h-full w-full object-cover">
        <source src={VIDEO_URL} type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <Card className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[#1e1e23]/[.82] text-white shadow-2xl backdrop-blur-xl">
        <CardHeader className="items-center px-8 pt-8 text-center">
          <ShieldX className="mb-3 size-12 text-primary" />
          <CardTitle className="text-2xl text-white">{message.title}</CardTitle>
          <CardDescription className="text-gray-300">{message.description}</CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <Button
            type="button"
            className="w-full"
            onClick={() => { window.location.href = "/login"; }}
          >
            <LogIn className="size-4" />
            Ir para o login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
