/**
 * "Tema Vidro Fosco com Wallpaper" — an installable visual theme.
 *
 * It is stored per CRM account in localStorage. The theme stays unavailable
 * until it has been installed; installing only flips a flag after a short
 * simulated progress run. When active, `<html>` gets `data-visual="glass"`
 * and the wallpaper is exposed as `--glass-wallpaper`; the rules that consume
 * both live in `globals.css`. The sidebar is intentionally untouched by those
 * rules.
 */

const GLASS_STORAGE_PREFIX = "wacrm.glassTheme.";

export function glassStorageKey(accountId: string) {
  return `${GLASS_STORAGE_PREFIX}${encodeURIComponent(accountId)}`;
}

export interface GlassWallpaperPreset {
  id: string;
  name: string;
  css: string;
}

export const GLASS_WALLPAPER_PRESETS: ReadonlyArray<GlassWallpaperPreset> = [
  {
    id: "sunset",
    name: "Pôr do sol",
    css: "radial-gradient(ellipse 70% 55% at 80% 15%, #ffb48a 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 15% 85%, #e0527a 0%, transparent 65%), linear-gradient(160deg, #2b2d52 0%, #6b4a7a 45%, #e98a8a 100%)",
  },
  {
    id: "planets",
    name: "Planetas",
    css: "radial-gradient(circle at 18% 70%, #d4379f 0%, #7a2c8f 22%, transparent 48%), radial-gradient(circle at 80% 22%, #5aa0c8 0%, transparent 28%), linear-gradient(180deg, #050816 0%, #0a1230 100%)",
  },
  {
    id: "aurora",
    name: "Aurora",
    css: "radial-gradient(ellipse 80% 50% at 30% 20%, #2fe0b0 0%, transparent 60%), radial-gradient(ellipse 70% 50% at 80% 40%, #7b5cff 0%, transparent 65%), linear-gradient(180deg, #06142a 0%, #0c2540 100%)",
  },
  {
    id: "ocean",
    name: "Oceano",
    css: "radial-gradient(ellipse 80% 60% at 70% 10%, #5ad0e8 0%, transparent 60%), linear-gradient(170deg, #0a3d62 0%, #145a86 50%, #0b2540 100%)",
  },
  {
    id: "orchid",
    name: "Orquídea",
    css: "radial-gradient(ellipse 70% 60% at 20% 20%, #ff6fb5 0%, transparent 60%), radial-gradient(ellipse 60% 60% at 85% 80%, #8f0759 0%, transparent 65%), linear-gradient(150deg, #2a0a2e 0%, #4b1650 100%)",
  },
];

export interface GlassThemeState {
  installed: boolean;
  active: boolean;
  /** Preset id, or "custom" when the user uploaded their own image. */
  wallpaperId: string;
  /** Ready-to-use CSS `background-image` value for the current wallpaper. */
  wallpaperCss: string;
}

export const DEFAULT_GLASS_STATE: GlassThemeState = {
  installed: false,
  active: false,
  wallpaperId: GLASS_WALLPAPER_PRESETS[0].id,
  wallpaperCss: GLASS_WALLPAPER_PRESETS[0].css,
};

export function readGlassState(accountId: string | null): GlassThemeState {
  if (typeof window === "undefined" || !accountId) return DEFAULT_GLASS_STATE;
  try {
    const raw = localStorage.getItem(glassStorageKey(accountId));
    if (!raw) return DEFAULT_GLASS_STATE;
    const parsed = JSON.parse(raw) as Partial<GlassThemeState>;
    const installed = parsed.installed === true;
    return {
      installed,
      active: installed && parsed.active === true,
      wallpaperId:
        typeof parsed.wallpaperId === "string"
          ? parsed.wallpaperId
          : DEFAULT_GLASS_STATE.wallpaperId,
      wallpaperCss:
        typeof parsed.wallpaperCss === "string" && parsed.wallpaperCss
          ? parsed.wallpaperCss
          : DEFAULT_GLASS_STATE.wallpaperCss,
    };
  } catch {
    return DEFAULT_GLASS_STATE;
  }
}

/** Mirrors the state onto <html>. Never applies while not installed. */
export function applyGlassState(state: GlassThemeState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (state.installed && state.active) {
    root.dataset.visual = "glass";
    root.style.setProperty("--glass-wallpaper", state.wallpaperCss);
  } else {
    delete root.dataset.visual;
    root.style.removeProperty("--glass-wallpaper");
  }
}

/** Throws if the browser refuses to store the value (e.g. quota exceeded). */
export function writeGlassState(accountId: string, state: GlassThemeState) {
  localStorage.setItem(glassStorageKey(accountId), JSON.stringify(state));
}

export function customWallpaperCss(dataUrl: string) {
  return `url("${dataUrl}")`;
}

/** Downscales an uploaded image so it fits comfortably in localStorage. */
export function imageFileToDataUrl(
  file: File,
  maxSide = 1920,
  quality = 0.8,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("not-an-image"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas-unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image-load-failed"));
    };
    img.src = url;
  });
}
