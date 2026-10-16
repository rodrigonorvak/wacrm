"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { LockKeyhole, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PLATFORM_FEATURE_ACCESS,
  getPlatformFeatureForPath,
  PLATFORM_FEATURES,
  type PlatformFeatureAccess,
  type PlatformFeatureKey,
} from "@/lib/platform-features";

interface FeatureAccessContextValue {
  features: PlatformFeatureAccess;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const FeatureAccessContext = createContext<FeatureAccessContextValue | null>(null);

export function FeatureAccessProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState(DEFAULT_PLATFORM_FEATURE_ACCESS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/platform/features", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(
          response.status === 500
            ? "Não foi possível consultar a liberação dos módulos."
            : "Não foi possível validar seu acesso aos módulos.",
        );
      }
      const body = (await response.json()) as { features?: PlatformFeatureAccess };
      if (!body.features) throw new Error("A resposta de acesso aos módulos está inválida.");
      setFeatures({ ...DEFAULT_PLATFORM_FEATURE_ACCESS, ...body.features });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar o acesso aos módulos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handleFocus = () => void refresh();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  return (
    <FeatureAccessContext.Provider value={{ features, loading, error, refresh }}>
      {children}
    </FeatureAccessContext.Provider>
  );
}

export function usePlatformFeatureAccess() {
  const context = useContext(FeatureAccessContext);
  if (!context) {
    throw new Error("usePlatformFeatureAccess must be used within FeatureAccessProvider");
  }
  return context;
}

export function PlatformFeatureRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const featureKey = getPlatformFeatureForPath(pathname);
  const { features, loading, error, refresh } = usePlatformFeatureAccess();

  if (!featureKey) return children;

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Verificando acesso ao módulo...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-64 max-w-lg flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 size-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!features[featureKey]) return <FeatureLockedNotice featureKey={featureKey} />;

  return children;
}

export function FeatureLockedNotice({ featureKey }: { featureKey: PlatformFeatureKey }) {
  const feature = PLATFORM_FEATURES.find((item) => item.key === featureKey);
  return (
    <div className="mx-auto flex min-h-64 max-w-lg flex-col items-center justify-center gap-3 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <LockKeyhole className="size-5" />
      </span>
      <h1 className="text-lg font-semibold">{feature?.label ?? "Módulo indisponível"}</h1>
      <p className="text-sm text-muted-foreground">
        Essa função ainda não foi liberada ou está em manutenção
      </p>
    </div>
  );
}
