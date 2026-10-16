"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  DEFAULT_GLASS_STATE,
  applyGlassState,
  glassStorageKey,
  readGlassState,
  writeGlassState,
  type GlassThemeState,
} from "@/lib/glass-theme";

const snapshots = new Map<string, GlassThemeState>();
const listeners = new Map<string, Set<() => void>>();

function getSnapshot(accountId: string | null): GlassThemeState {
  if (!accountId) return DEFAULT_GLASS_STATE;
  const cached = snapshots.get(accountId);
  if (cached) return cached;
  const state = readGlassState(accountId);
  snapshots.set(accountId, state);
  return state;
}

function subscribe(accountId: string | null, listener: () => void) {
  if (!accountId) return () => {};

  const accountListeners = listeners.get(accountId) ?? new Set<() => void>();
  accountListeners.add(listener);
  listeners.set(accountId, accountListeners);

  const storageKey = glassStorageKey(accountId);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey) return;
    snapshots.delete(accountId);
    accountListeners.forEach((subscriber) => subscriber());
  };
  window.addEventListener("storage", onStorage);

  return () => {
    accountListeners.delete(listener);
    if (accountListeners.size === 0) listeners.delete(accountId);
    window.removeEventListener("storage", onStorage);
  };
}

function getServerSnapshot(): GlassThemeState {
  return DEFAULT_GLASS_STATE;
}

function emit(accountId: string, next: GlassThemeState) {
  snapshots.set(accountId, next);
  applyGlassState(next);
  listeners.get(accountId)?.forEach((listener) => listener());
}

export function useGlassTheme(accountId: string | null) {
  const subscribeToAccount = useCallback(
    (listener: () => void) => subscribe(accountId, listener),
    [accountId],
  );
  const readAccountSnapshot = useCallback(
    () => getSnapshot(accountId),
    [accountId],
  );
  const state = useSyncExternalStore(
    subscribeToAccount,
    readAccountSnapshot,
    getServerSnapshot,
  );

  /** Returns false when no account is resolved or persistence fails. */
  const update = useCallback(
    (patch: Partial<GlassThemeState>) => {
      if (!accountId) return false;
      const next = { ...getSnapshot(accountId), ...patch };
      if (!next.installed) next.active = false;
      try {
        writeGlassState(accountId, next);
      } catch {
        return false;
      }
      emit(accountId, next);
      return true;
    },
    [accountId],
  );

  return { state, update };
}
