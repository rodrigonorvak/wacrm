"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Check,
  Download,
  ImagePlus,
  Loader2,
  Paintbrush,
  Power,
  Trash2,
} from "lucide-react";

import { useGlassTheme } from "@/hooks/use-glass-theme";
import {
  GLASS_WALLPAPER_PRESETS,
  customWallpaperCss,
  imageFileToDataUrl,
} from "@/lib/glass-theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsPanelHead } from "./settings-panel-head";

const THEME_NAME = "Tema Vidro Fosco com Wallpaper";
const INSTALL_STEPS = [
  "Baixando recursos do tema…",
  "Preparando efeitos de vidro…",
  "Aplicando configurações…",
  "Finalizando instalação…",
];
const INSTALL_DURATION_MS = 2400;

/**
 * Appearance panel — a small theme catalog. Themes are installable:
 * until installed they can't be activated or edited.
 */
export function AppearancePanel() {
  const t = useTranslations("Settings.appearance");
  const { state, update } = useGlassTheme();
  const [progress, setProgress] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const installing = progress !== null;

  function install() {
    if (installing) return;
    setProgress(0);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const ratio = Math.min(1, (Date.now() - startedAt) / INSTALL_DURATION_MS);
      setProgress(Math.round(ratio * 100));
      if (ratio >= 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        const saved = update({ installed: true, active: false });
        setProgress(null);
        if (saved) toast.success("Tema instalado. Agora você pode ativá-lo.");
        else toast.error("Não foi possível salvar a instalação neste navegador.");
      }
    }, 60);
  }

  function uninstall() {
    update({ installed: false, active: false });
    toast.success("Tema desinstalado.");
  }

  const stepLabel =
    INSTALL_STEPS[
      Math.min(
        INSTALL_STEPS.length - 1,
        Math.floor(((progress ?? 0) / 100) * INSTALL_STEPS.length),
      )
    ];

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t("title")} description={t("description")} />

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Paintbrush className="size-4 text-muted-foreground" />
          Temas
        </h3>

        <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:p-5">
          <div className="sm:w-56 sm:shrink-0">
            <GlassPreview css={state.wallpaperCss} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold text-foreground">
                  {THEME_NAME}
                </h4>
                {state.active && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <Check className="size-3" />
                    Ativo
                  </span>
                )}
                {state.installed && !state.active && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Instalado
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Superfícies translúcidas com efeito de vidro fosco sobre um
                wallpaper à sua escolha. A barra lateral não muda.
              </p>
            </div>

            {installing ? (
              <div className="space-y-1.5" role="status" aria-live="polite">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" />
                    {stepLabel}
                  </span>
                  <span>{progress}%</span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress ?? 0}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-100"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {!state.installed ? (
                  <Button type="button" onClick={install}>
                    <Download className="mr-1.5 size-4" />
                    Instalar
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant={state.active ? "outline" : "default"}
                      onClick={() => update({ active: !state.active })}
                    >
                      <Power className="mr-1.5 size-4" />
                      {state.active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditing(true)}
                    >
                      <Paintbrush className="mr-1.5 size-4" />
                      Editar tema
                    </Button>
                    <Button type="button" variant="outline" onClick={uninstall}>
                      <Trash2 className="mr-1.5 size-4" />
                      Desinstalar
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </article>
      </div>

      {state.installed && (
        <EditGlassThemeDialog open={editing} onOpenChange={setEditing} />
      )}
    </section>
  );
}

function GlassPreview({ css }: { css: string }) {
  return (
    <div
      aria-hidden
      className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-cover bg-center"
      style={{ backgroundImage: css }}
    >
      <div className="w-3/5 space-y-1.5 rounded-lg border border-white/30 bg-white/15 p-3 shadow-lg backdrop-blur-md">
        <span className="block h-1.5 w-2/3 rounded-full bg-white/80" />
        <span className="block h-1.5 w-full rounded-full bg-white/50" />
        <span className="block h-1.5 w-4/5 rounded-full bg-white/50" />
      </div>
    </div>
  );
}

function EditGlassThemeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { state, update } = useGlassTheme();
  const [draftId, setDraftId] = useState(state.wallpaperId);
  const [draftCss, setDraftCss] = useState(state.wallpaperCss);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset the draft whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setDraftId(state.wallpaperId);
      setDraftCss(state.wallpaperCss);
    }
    // Only the open transition should reset the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      let dataUrl = await imageFileToDataUrl(file);
      if (dataUrl.length > 2_500_000) {
        dataUrl = await imageFileToDataUrl(file, 1280, 0.7);
      }
      setDraftId("custom");
      setDraftCss(customWallpaperCss(dataUrl));
    } catch {
      toast.error("Não foi possível usar essa imagem. Tente outro arquivo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save() {
    const saved = update({ wallpaperId: draftId, wallpaperCss: draftCss });
    if (!saved) {
      toast.error("A imagem é grande demais para salvar neste navegador.");
      return;
    }
    toast.success("Wallpaper atualizado.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar tema</DialogTitle>
          <DialogDescription>
            Escolha o wallpaper que aparece atrás das telas do CRM.
          </DialogDescription>
        </DialogHeader>

        <GlassPreview css={draftCss} />

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {GLASS_WALLPAPER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.name}
              aria-label={preset.name}
              aria-pressed={draftId === preset.id}
              onClick={() => {
                setDraftId(preset.id);
                setDraftCss(preset.css);
              }}
              className={cn(
                "aspect-square rounded-lg bg-cover bg-center ring-offset-2 transition",
                draftId === preset.id
                  ? "ring-2 ring-primary"
                  : "ring-1 ring-border hover:ring-primary/50",
              )}
              style={{ backgroundImage: preset.css }}
            />
          ))}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-1.5 size-4" />
          )}
          Usar minha imagem
        </Button>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={uploading}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
