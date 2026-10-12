"use client";

import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-8">
      <video
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        className="fixed inset-0 h-full w-full object-cover"
      >
        <source
          src="https://agencia.malybo.com.br/wp-content/uploads/2026/09/grok-video-f1bb9f33-811b-4d0c-8fc6-1752a31d7085.mp4"
          type="video/mp4"
        />
      </video>
      <div className="fixed inset-0 bg-black/45" aria-hidden="true" />

      <Card className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[#1e1e23]/[.78] text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
        <CardHeader className="items-center px-8 pt-8 text-center sm:px-10 sm:pt-10">
          <Image
            unoptimized
            width={2560}
            height={816}
            src="https://agencia.malybo.com.br/wp-content/uploads/2026/09/0C1026.png"
            alt="CRMIntegrado"
            className="mx-auto mb-5 block h-16 w-auto object-contain drop-shadow-lg"
          />
          <CardTitle className="text-2xl font-bold text-white">
            CRM<span className="text-primary">Integrado</span>
          </CardTitle>
          <CardDescription className="mt-1 text-sm text-gray-300">
            {inviteToken ? t('descAccept') : 'Acesse sua conta para continuar'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8 sm:px-10 sm:pb-10">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void handleGoogleLogin()}
            className="h-12 w-full rounded-xl border-white/15 bg-white/10 text-white transition-all hover:scale-[1.02] hover:bg-white/20 active:scale-[.98] disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
              <path
                fill="#4285F4"
                d="M21.805 10.045h-9.78v4.01h5.625c-.243 1.29-.974 2.385-2.073 3.12v2.59h3.35c1.96-1.805 3.093-4.462 3.093-7.62 0-.72-.065-1.415-.215-2.1Z"
              />
              <path
                fill="#34A853"
                d="M12.025 24c2.8 0 5.145-.925 6.86-2.505l-3.35-2.59c-.925.62-2.105.985-3.51.985-2.7 0-4.99-1.825-5.81-4.28H2.75v2.675A10.365 10.365 0 0 0 12.025 24Z"
              />
              <path
                fill="#FBBC05"
                d="M6.215 15.61a6.23 6.23 0 0 1-.325-1.985c0-.69.12-1.36.325-1.985V8.965H2.75A11.99 11.99 0 0 0 1.48 13.625c0 1.68.405 3.27 1.27 4.66l3.465-2.675Z"
              />
              <path
                fill="#EA4335"
                d="M12.025 7.36c1.525 0 2.895.525 3.97 1.555l2.975-2.975C17.165 4.26 14.82 3.3 12.025 3.3A10.365 10.365 0 0 0 2.75 8.965l3.465 2.675c.82-2.455 3.11-4.28 5.81-4.28Z"
              />
            </svg>
            Continuar com Google
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
            <span className="h-px flex-1 bg-white/10" />
            <span>ou entre com e-mail</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/20 px-4 py-3 text-sm text-red-200 backdrop-blur-sm">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-200">
                {t('emailLabel')}
              </Label>
              <div className="relative">
                <UserRound className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 rounded-xl border-white/10 bg-white/10 pl-12 text-white placeholder:text-gray-400 outline-none transition-all focus:border-primary focus:bg-white/20 focus:ring-4 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium text-gray-200">
                  {t('passwordLabel')}
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-primary hover:text-primary/80"
                >
                  {t('forgotPassword')}
                </Link>
              </div>
              <div className="relative">
                <LockKeyhole className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t('passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 rounded-xl border-white/10 bg-white/10 pr-12 pl-12 text-white placeholder:text-gray-400 outline-none transition-all focus:border-primary focus:bg-white/20 focus:ring-4 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute top-1/2 right-4 -translate-y-1/2 text-gray-400 transition-colors hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-14 w-full rounded-xl bg-primary text-base font-medium text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:scale-[1.02] hover:bg-primary/90 active:scale-[.98] disabled:opacity-50"
            >
              {loading ? t('signingIn') : <>{t('signIn')} <span aria-hidden="true">→</span></>}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-300">
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
        </CardContent>
      </Card>
    </div>
  );
}
