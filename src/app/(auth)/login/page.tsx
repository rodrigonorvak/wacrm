"use client";

import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// `useSearchParams` opts the component out of static prerendering
// unless it sits under a Suspense boundary. We split the form into
// a child component so the outer page can prerender the chrome
// (background, card frame) while the form hydrates with the query
// string on the client.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  // Forwarded from `/join/<token>` when the visitor already has an
  // account. After a successful sign-in we send them to the join
  // page to accept rather than to /dashboard.
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("LoginPage");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(() => searchParams.get("error"));
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Full-page navigation (not router.push) so the browser issues a
    // fresh top-level request that carries the just-written Supabase
    // auth cookies to the middleware gating /dashboard. A soft
    // client-side navigation can reach the protected route before the
    // server observes the new session, so the middleware bounces it
    // back to /login — which looks like the page "just refreshing"
    // instead of signing in (issue #365). Mirrors the deliberate full
    // reload the invite-accept flow already uses in join/[token].
    const destination = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : "/dashboard";
    window.location.href = destination;
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);

    const next = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : "/dashboard";
    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#03030a] px-4 py-8">
      <video
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        className="fixed inset-0 h-full w-full scale-105 object-cover opacity-75 blur-[1px]"
      >
        <source
          src="https://agencia.malybo.com.br/wp-content/uploads/2026/09/grok-video-f1bb9f33-811b-4d0c-8fc6-1752a31d7085.mp4"
          type="video/mp4"
        />
      </video>
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_20%_5%,rgb(47_66_138_/_38%),transparent_40%),radial-gradient(ellipse_at_85%_85%,rgb(225_12_140_/_18%),transparent_42%),linear-gradient(180deg,rgb(3_5_17_/_30%),rgb(0_0_0_/_78%))]" aria-hidden="true" />

      <Card className="relative z-10 w-full max-w-[25.75rem] overflow-hidden rounded-[2rem] border border-white/10 bg-[#11121b]/[.72] text-white shadow-[0_32px_90px_rgb(0_0_0_/_62%)] backdrop-blur-2xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-[linear-gradient(155deg,rgb(68_87_159_/_32%),transparent_70%)]"
        />
        <CardHeader className="relative items-center px-8 pt-10 pb-6 text-center sm:px-12">
          <Image
            unoptimized
            width={2560}
            height={816}
            priority
            src="https://agencia.malybo.com.br/wp-content/uploads/2026/09/0C1026.png"
            alt="CRMIntegrado"
            className="mx-auto mb-8 block h-10 w-auto object-contain drop-shadow-lg"
          />
          <CardTitle className="text-[1.8rem] font-semibold tracking-tight text-white">
            {t(inviteToken ? "titleAccept" : "titleWelcome")}
          </CardTitle>
          <CardDescription className="mt-1.5 text-sm text-white/55">
            {t(inviteToken ? "descAccept" : "descWelcome")}
          </CardDescription>
        </CardHeader>
        <CardContent className="relative px-8 pb-8 sm:px-12 sm:pb-10">
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/20 px-4 py-3 text-sm text-red-200 backdrop-blur-sm">
                {error}
              </div>
            )}

            <div>
              <Label htmlFor="email" className="sr-only">
                {t('emailLabel')}
              </Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute top-1/2 left-5 h-[1.15rem] w-[1.15rem] -translate-y-1/2 text-white/45" />
                <Input
                  id="email"
                  type="email"
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-14 rounded-2xl border-white/[.08] bg-black/15 pl-12 text-[0.95rem] text-white placeholder:text-white/40 shadow-inner shadow-black/10 transition-all focus:border-primary/70 focus:bg-black/25 focus:ring-4 focus:ring-primary/20"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password" className="sr-only">
                {t('passwordLabel')}
              </Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute top-1/2 left-5 h-[1.15rem] w-[1.15rem] -translate-y-1/2 text-white/45" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t('passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-14 rounded-2xl border-white/[.08] bg-black/15 pr-12 pl-12 text-[0.95rem] text-white placeholder:text-white/40 shadow-inner shadow-black/10 transition-all focus:border-primary/70 focus:bg-black/25 focus:ring-4 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute top-1/2 right-5 -translate-y-1/2 text-white/45 transition-colors hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-[1.15rem] w-[1.15rem]" /> : <Eye className="h-[1.15rem] w-[1.15rem]" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-white/50 transition-colors hover:text-primary"
              >
                {t('forgotPassword')}
              </Link>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-1 h-14 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-[0_12px_28px_rgb(225_12_140_/_30%)] transition-all hover:scale-[1.015] hover:bg-primary-hover active:scale-[.985] disabled:opacity-50"
            >
              {loading ? t('signingIn') : <>{t('signIn')} <ArrowRight className="ml-1 size-5" aria-hidden="true" /></>}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[0.7rem] text-white/35">
            <span className="h-px flex-1 bg-white/10" />
            <span>ou</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void handleGoogleLogin()}
            className="h-11 w-full rounded-xl border-white/10 bg-white/[.06] text-sm text-white/80 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-[.985] disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[1.1rem]">
              <path fill="#4285F4" d="M21.805 10.045h-9.78v4.01h5.625c-.243 1.29-.974 2.385-2.073 3.12v2.59h3.35c1.96-1.805 3.093-4.462 3.093-7.62 0-.72-.065-1.415-.215-2.1Z" />
              <path fill="#34A853" d="M12.025 24c2.8 0 5.145-.925 6.86-2.505l-3.35-2.59c-.925.62-2.105.985-3.51.985-2.7 0-4.99-1.825-5.81-4.28H2.75v2.675A10.365 10.365 0 0 0 12.025 24Z" />
              <path fill="#FBBC05" d="M6.215 15.61a6.23 6.23 0 0 1-.325-1.985c0-.69.12-1.36.325-1.985V8.965H2.75A11.99 11.99 0 0 0 1.48 13.625c0 1.68.405 3.27 1.27 4.66l3.465-2.675Z" />
              <path fill="#EA4335" d="M12.025 7.36c1.525 0 2.895.525 3.97 1.555l2.975-2.975C17.165 4.26 14.82 3.3 12.025 3.3A10.365 10.365 0 0 0 2.75 8.965l3.465 2.675c.82-2.455 3.11-4.28 5.81-4.28Z" />
            </svg>
            Continuar com Google
          </Button>

          <p className="mt-6 text-center text-sm text-white/55">
            {t('noAccount')}{" "}
            <Link
              href={
                inviteToken
                  ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                  : "/signup"
              }
              className="font-medium text-primary hover:text-primary/80"
            >
              {t('createAccount')}
            </Link>
          </p>
          <p className="mt-8 text-center text-[0.6rem] font-medium tracking-[0.22em] text-white/25">
            CRM INTEGRADO · 2026
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
