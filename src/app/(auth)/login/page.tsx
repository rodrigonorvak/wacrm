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
    <div className="flex min-h-screen items-center justify-center bg-[#eef3f8] p-3 sm:p-6">
      <div className="grid min-h-[640px] w-full max-w-6xl overflow-hidden rounded-[1.75rem] bg-white shadow-[0_16px_50px_rgb(15_23_42_/_8%)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,#e10c8c_0%,#b5087a_55%,#7a044f_100%)] p-10 text-white lg:flex">
          <Image
            unoptimized
            width={2560}
            height={816}
            priority
            src="https://agencia.malybo.com.br/wp-content/uploads/2026/09/0C1026.png"
            alt="CRMIntegrado"
            className="h-9 w-auto object-contain brightness-0 invert"
          />
          <div>
            <h2 className="max-w-sm text-4xl font-semibold leading-tight">
              O lugar do seu trabalho.
            </h2>
            <p className="mt-3 text-lg text-white/85">Planeje. Crie. Controle.</p>
          </div>
          <div aria-hidden className="relative mx-auto h-52 w-full max-w-sm">
            <div className="absolute inset-x-6 bottom-0 top-6 rounded-2xl bg-white/15 p-4 backdrop-blur-sm">
              <div className="grid grid-cols-3 gap-3">
                {["Novo", "Em conversa", "Ganho"].map((column) => (
                  <div key={column} className="space-y-2">
                    <p className="text-[11px] font-medium text-white/80">{column}</p>
                    <div className="h-10 rounded-lg bg-white/80" />
                    <div className="h-14 rounded-lg bg-[#ffe08a]" />
                    <div className="h-8 rounded-lg bg-white/50" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <main className="flex items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <Image
                unoptimized
                width={2560}
                height={816}
                priority
                src="https://agencia.malybo.com.br/wp-content/uploads/2026/09/0C1026.png"
                alt="CRMIntegrado"
                className="h-8 w-auto object-contain"
              />
            </div>
            <h1 className="text-center text-2xl font-semibold text-[#1c2430]">
              {t(inviteToken ? "titleAccept" : "titleWelcome")}
            </h1>
            <p className="mt-2 text-center text-sm text-[#6b7686]">
              {t(inviteToken ? "descAccept" : "descWelcome")}
            </p>

            <form onSubmit={handleLogin} className="mt-8 flex flex-col gap-4">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <Label htmlFor="email" className="mb-1.5 text-sm text-[#1c2430]">
                  {t("emailLabel")}
                </Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8b95a3]" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11 rounded-xl border-[#e6ebf2] bg-white pl-10 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="password" className="mb-1.5 text-sm text-[#1c2430]">
                  {t("passwordLabel")}
                </Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8b95a3]" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 rounded-xl border-[#e6ebf2] bg-white pr-10 pl-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-[#8b95a3] hover:text-[#1c2430]"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <Link href="/forgot-password" className="text-sm text-[#6b7686] hover:text-primary">
                  {t("forgotPassword")}
                </Link>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full bg-primary text-sm font-semibold text-white hover:bg-primary-hover"
              >
                {loading ? t("signingIn") : <>{t("signIn")} <ArrowRight className="size-4" aria-hidden="true" /></>}
              </Button>
            </form>

            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void handleGoogleLogin()}
              className="mt-3 h-11 w-full border-[#e6ebf2] bg-white text-sm text-[#1c2430] hover:bg-[#f7f9fc]"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
                <path fill="#4285F4" d="M21.805 10.045h-9.78v4.01h5.625c-.243 1.29-.974 2.385-2.073 3.12v2.59h3.35c1.96-1.805 3.093-4.462 3.093-7.62 0-.72-.065-1.415-.215-2.1Z" />
                <path fill="#34A853" d="M12.025 24c2.8 0 5.145-.925 6.86-2.505l-3.35-2.59c-.925.62-2.105.985-3.51.985-2.7 0-4.99-1.825-5.81-4.28H2.75v2.675A10.365 10.365 0 0 0 12.025 24Z" />
                <path fill="#FBBC05" d="M6.215 15.61a6.23 6.23 0 0 1-.325-1.985c0-.69.12-1.36.325-1.985V8.965H2.75A11.99 11.99 0 0 0 1.48 13.625c0 1.68.405 3.27 1.27 4.66l3.465-2.675Z" />
                <path fill="#EA4335" d="M12.025 7.36c1.525 0 2.895.525 3.97 1.555l2.975-2.975C17.165 4.26 14.82 3.3 12.025 3.3A10.365 10.365 0 0 0 2.75 8.965l3.465 2.675c.82-2.455 3.11-4.28 5.81-4.28Z" />
              </svg>
              Continuar com Google
            </Button>

            <p className="mt-6 text-center text-sm text-[#6b7686]">
              {t("noAccount")}{" "}
              <Link
                href={inviteToken ? `/signup?invite=${encodeURIComponent(inviteToken)}` : "/signup"}
                className="font-medium text-primary hover:text-primary/80"
              >
                {t("createAccount")}
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
