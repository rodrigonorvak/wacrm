"use client";

import Link from "next/link";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const VIDEO_URL =
  "https://agencia.malybo.com.br/wp-content/uploads/2026/09/grok-video-f1bb9f33-811b-4d0c-8fc6-1752a31d7085.mp4";

export default function AccountPendingPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-8">
      <video autoPlay loop muted playsInline aria-hidden="true" className="fixed inset-0 h-full w-full object-cover">
        <source src={VIDEO_URL} type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <Card className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[#1e1e23]/[.82] text-white shadow-2xl backdrop-blur-xl">
        <CardHeader className="items-center px-8 pt-8 text-center">
          <Clock3 className="mb-3 size-12 text-primary" />
          <CardTitle className="text-2xl text-white">Cadastro recebido</CardTitle>
          <CardDescription className="text-gray-300">
            Seus dados foram recebidos e serão analisados pela equipe da Malybo.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8 text-center">
          <p className="text-sm text-gray-300">
            O acesso ao CRM será liberado assim que sua conta for aprovada.
          </p>
          <Link href="/login" className="mt-6 block">
            <Button variant="outline" className="w-full border-white/20 bg-white/10 text-white hover:bg-white/20">
              Voltar para o login
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
