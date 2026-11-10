"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useGlassTheme } from "@/hooks/use-glass-theme";
import {
  applyGlassState,
  DEFAULT_GLASS_STATE,
} from "@/lib/glass-theme";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AccountAccessAlert } from "@/components/layout/account-access-alert";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import {
  FeatureAccessProvider,
  PlatformFeatureRouteGuard,
} from "@/components/platform/feature-access-provider";
import { cn } from "@/lib/utils";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, accountId } = useAuth();
  const { state: glassTheme } = useGlassTheme(accountId);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mobileConversationOpen =
    pathname === "/inbox" && searchParams.has("c");

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    applyGlassState(accountId ? glassTheme : DEFAULT_GLASS_STATE);
  }, [accountId, glassTheme]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background max-lg:h-dvh">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <Sidebar
        open={sidebarOpen}
        onClose={closeSidebar}
        hideMobileNav={mobileConversationOpen}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className={mobileConversationOpen ? "max-lg:hidden" : undefined}>
          <Header onOpenSidebar={() => setSidebarOpen(true)} />
        </div>
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main
          className={cn(
            "min-h-0 flex-1 overflow-y-auto p-4 pb-20 sm:p-6 sm:pb-24 lg:pb-6",
            mobileConversationOpen && "max-lg:!overflow-hidden max-lg:!p-0 max-lg:!pb-0",
          )}
        >
          {/* Above every page: writes are being rejected and here's why.
              Renders nothing unless the account/role failed to resolve. */}
          <AccountAccessAlert />
          <PlatformFeatureRouteGuard>{children}</PlatformFeatureRouteGuard>
        </main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <FeatureAccessProvider>
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center bg-background">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          }
        >
          <DashboardShellInner>{children}</DashboardShellInner>
        </Suspense>
      </FeatureAccessProvider>
    </AuthProvider>
  );
}
