export const PLATFORM_FEATURES = [
  { key: "broadcasts", label: "Disparos", href: "/broadcasts" },
  { key: "automations", label: "Automações", href: "/automations" },
  { key: "flows", label: "Fluxos (BETA)", href: "/flows" },
  { key: "agents", label: "Agentes de IA", href: "/agents" },
] as const;

export type PlatformFeatureKey = (typeof PLATFORM_FEATURES)[number]["key"];
export type PlatformFeatureAccess = Record<PlatformFeatureKey, boolean>;

export const DEFAULT_PLATFORM_FEATURE_ACCESS: PlatformFeatureAccess = {
  broadcasts: false,
  automations: false,
  flows: false,
  agents: false,
};

export function isPlatformFeatureKey(value: unknown): value is PlatformFeatureKey {
  return PLATFORM_FEATURES.some((feature) => feature.key === value);
}

export function getPlatformFeatureForPath(pathname: string): PlatformFeatureKey | null {
  const match = PLATFORM_FEATURES.find(
    (feature) => pathname === feature.href || pathname.startsWith(`${feature.href}/`),
  );
  return match?.key ?? null;
}
