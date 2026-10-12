"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoaderCircle, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

const VIDEO_URL =
  "https://agencia.malybo.com.br/wp-content/uploads/2026/09/grok-video-f1bb9f33-811b-4d0c-8fc6-1752a31d7085.mp4";

export default function AccountDeniedPage() {
  const [redirecting, setRedirecting] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.signOut().finally(() => {
      setRedirecting(false);
      window.location.replace("/login");
    });
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-8">
      <video autoPlay loop muted playsInline aria-hidden="true" className="fixed inset-0 h-full w-full object-cover">
        <source src={VIDEO_URL} type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <Card className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[#1e1e23]/[.82] text-white shadow-2xl backdrop-blur-xl">
        <CardHeader className="items-center px-8 pt-8 text-center">
          <ShieldX className="mb-3 size-12 text-red-300" />
          <CardTitle className="text-2xl text-white">Acesso indisponível</CardTitle>
          <CardDescription className="text-gray-300">
            Sua conta não tem acesso ativo ao CRM no momento. Entre em contato com a equipe Malybo se precisar de ajuda.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          {redirecting && (
            <p className="mb-4 flex items-center justify-center gap-2 text-sm text-gray-300">
              <LoaderCircle className="size-4 animate-spin" />
              Redirecionando para o login...
            </p>
          )}
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
