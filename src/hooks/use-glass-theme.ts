"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  DEFAULT_GLASS_STATE,
  GLASS_STORAGE_KEY,
  applyGlassState,
  readGlassState,
  writeGlassState,
  type GlassThemeState,
} from "@/lib/glass-theme";

const listeners = new Set<() => void>();
let cached: GlassThemeState | null = null;

function getSnapshot(): GlassThemeState {
  if (cached === null) cached = readGlassState();
  return cached;
}

function getServerSnapshot(): GlassThemeState {
  return DEFAULT_GLASS_STATE;
}

function emit(next: GlassThemeState) {
  cached = next;
  applyGlassState(next);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === GLASS_STORAGE_KEY) emit(readGlassState());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useGlassTheme() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /** Returns false when the browser could not persist the change. */
  const update = useCallback((patch: Partial<GlassThemeState>) => {
    const next = { ...getSnapshot(), ...patch };
    if (!next.installed) next.active = false;
    try {
      writeGlassState(next);
    } catch {
      return false;
    }
    emit(next);
    return true;
  }, []);

  return { state, update };
}
