'use client';

// Settings → Plugins. Hoje só o plugin do WhatsApp (Cadastro Incorporado
// com Coexistência). O card abre o painel de conexão.

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';

interface EmbeddedConfig {
  available: boolean;
  appId?: string;
  configId?: string;
  apiVersion?: string;
}

interface ConnectionStatus {
  connected: boolean;
  phone?: string | null;
}

interface FbLoginResponse {
  authResponse?: { code?: string } | null;
}

interface FbSdk {
  init: (opts: Record<string, unknown>) => void;
  login: (cb: (res: FbLoginResponse) => void, opts: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 4.54 0 8.23 3.69 8.23 8.23s-3.69 8.24-8.23 8.24Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07s.89 2.4 1.01 2.56c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.29Z" />
    </svg>
  );
}

function loadFacebookSdk(appId: string, version: string): Promise<FbSdk> {
  return new Promise((resolve, reject) => {
    const init = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: true, version });
      resolve(window.FB!);
    };
    if (window.FB) {
      init();
      return;
    }
    window.fbAsyncInit = init;
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => reject(new Error('Não foi possível carregar o SDK do Facebook.'));
    document.body.appendChild(script);
  });
}

function WhatsAppPlugin({ onBack }: { onBack: () => void }) {
  const [config, setConfig] = useState<EmbeddedConfig | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{
    code?: string;
    waba?: string;
    phone?: string;
    coexistence?: boolean;
  }>({});

  const refresh = useCallback(async () => {
    const [cfg, conn] = await Promise.all([
      fetch('/api/whatsapp/embedded/config').then((r) => r.json()).catch(() => null),
      fetch('/api/whatsapp/config').then((r) => r.json()).catch(() => null),
    ]);
    setConfig(cfg ?? { available: false });
    setStatus({
      connected: !!conn?.connected,
      phone: conn?.phone_info?.display_phone_number ?? null,
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const complete = useCallback(async () => {
    const { code, waba, phone, coexistence } = pending.current;
    if (!code || !waba || !phone) return;
    pending.current = {};
    setBusy(true);
    try {
      const res = await fetch('/api/whatsapp/embedded/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          waba_id: waba,
          phone_number_id: phone,
          coexistence: !!coexistence,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Falha ao concluir a conexão.');
      toast.success('WhatsApp conectado!');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao concluir a conexão.');
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;
      let data: unknown = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const msg = data as {
        type?: string;
        event?: string;
        data?: { phone_number_id?: string; waba_id?: string; error_message?: string };
      };
      if (msg?.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (msg.event?.startsWith('FINISH')) {
        pending.current.waba = msg.data?.waba_id;
        pending.current.phone = msg.data?.phone_number_id;
        pending.current.coexistence = msg.event.includes('WHATSAPP_BUSINESS_APP');
        void complete();
      } else if (msg.event === 'CANCEL') {
        setBusy(false);
      } else if (msg.event === 'ERROR') {
        setBusy(false);
        toast.error(msg.data?.error_message ?? 'Erro no cadastro do WhatsApp.');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [complete]);

  const connect = async () => {
    if (!config?.available || !config.appId || !config.configId) return;
    setBusy(true);
    pending.current = {};
    try {
      const fb = await loadFacebookSdk(config.appId, config.apiVersion ?? 'v21.0');
      fb.login(
        (res) => {
          const code = res.authResponse?.code;
          if (!code) {
            setBusy(false);
            return;
          }
          pending.current.code = code;
          void complete();
        },
        {
          config_id: config.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: 'whatsapp_business_app_onboarding',
            sessionInfoVersion: '3',
          },
        },
      );
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : 'Falha ao iniciar a conexão.');
    }
  };

  const disconnect = async () => {
    if (!confirm('Desconectar o WhatsApp desta conta?')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao desconectar.');
      toast.success('WhatsApp desconectado.');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao desconectar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={onBack}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Plugins
      </Button>
      <SettingsPanelHead
        title="WhatsApp"
        description="Conecte seu número do WhatsApp Business pelo Cadastro Incorporado da Meta. Com a coexistência, você continua usando o app do celular junto com o CRM."
      />
      {!config || !status ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <WhatsAppGlyph className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">WhatsApp Business</p>
                <p className="text-sm text-muted-foreground">
                  {status.connected
                    ? `Conectado${status.phone ? ` · ${status.phone}` : ''}`
                    : 'Nenhum número conectado'}
                </p>
              </div>
              {status.connected ? (
                <Badge className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Conectado
                </Badge>
              ) : null}
            </div>

            {!config.available ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                O Cadastro Incorporado ainda não está disponível: o administrador da
                plataforma precisa cadastrar e ativar o app Meta (com Config ID e App
                Secret) em Configurações → Apps.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button onClick={connect} disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {status.connected ? 'Reconectar WhatsApp' : 'Conectar WhatsApp'}
                </Button>
                {status.connected ? (
                  <Button variant="outline" onClick={disconnect} disabled={busy}>
                    Desconectar
                  </Button>
                ) : null}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Prefere configurar à mão com token próprio? Use{' '}
              <a className="underline" href="?tab=whatsapp">
                Configurações → WhatsApp
              </a>
              .
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function PluginsPanel() {
  const [open, setOpen] = useState<'whatsapp' | null>(null);

  if (open === 'whatsapp') return <WhatsAppPlugin onBack={() => setOpen(null)} />;

  return (
    <div>
      <SettingsPanelHead
        title="Plugins"
        description="Conecte serviços externos ao seu CRM."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          onClick={() => setOpen('whatsapp')}
          className="rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40"
        >
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <WhatsAppGlyph className="h-6 w-6" />
          </span>
          <p className="font-medium">WhatsApp</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Conecte seu número pelo Cadastro Incorporado da Meta.
          </p>
        </button>
      </div>
    </div>
  );
}
