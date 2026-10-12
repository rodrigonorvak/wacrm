"use client";

import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const VIDEO_URL =
  "https://agencia.malybo.com.br/wp-content/uploads/2026/09/grok-video-f1bb9f33-811b-4d0c-8fc6-1752a31d7085.mp4";

export default function AccountDeniedPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-8">
      <video autoPlay loop muted playsInline aria-hidden="true" className="fixed inset-0 h-full w-full object-cover">
        <source src={VIDEO_URL} type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <Card className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[#1e1e23]/[.82] text-white shadow-2xl backdrop-blur-xl">
        <CardHeader className="items-center px-8 pt-8 text-center">
          <ShieldX className="mb-3 size-12 text-red-300" />
          <CardTitle className="text-2xl text-white">Pedido não aprovado</CardTitle>
          <CardDescription className="text-gray-300">
            No momento, seu pedido de criação de conta não foi aprovado pela equipe Malybo.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <Link href="/login" className="block">
            <Button variant="outline" className="w-full border-white/20 bg-white/10 text-white hover:bg-white/20">
              Voltar para o login
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
