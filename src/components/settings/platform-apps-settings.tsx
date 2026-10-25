'use client';

// Settings → Apps (somente super admin da plataforma).
// Cadastra o app Meta usado no Cadastro Incorporado do WhatsApp.
// Segredos nunca voltam do servidor: só se informa se estão salvos.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { META_API_VERSIONS } from '@/lib/meta-api-versions';
import { SettingsPanelHead } from './settings-panel-head';

interface MetaApp {
  id: string;
  name: string;
  description: string | null;
  app_id: string;
  api_version: string;
  config_id: string | null;
  redirect_uri: string | null;
  instagram_app_id: string | null;
  webhook_verify_token: string | null;
  active: boolean;
  has_app_secret: boolean;
  has_system_token: boolean;
}

interface FormState {
  name: string;
  description: string;
  app_id: string;
  api_version: string;
  config_id: string;
  redirect_uri: string;
  instagram_app_id: string;
  webhook_verify_token: string;
  app_secret: string;
  system_token: string;
}

const emptyForm = (origin: string): FormState => ({
  name: '',
  description: '',
  app_id: '',
  api_version: META_API_VERSIONS[0],
  config_id: '',
  redirect_uri: origin,
  instagram_app_id: '',
  webhook_verify_token: '',
  app_secret: '',
  system_token: '',
});

export function PlatformAppsSettings() {
  const [apps, setApps] = useState<MetaApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MetaApp | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(''));
  const [saving, setSaving] = useState(false);

  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/platform-admin/apps', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setApps(json.apps ?? []);
    } catch {
      toast.error('Não foi possível carregar os apps');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setForm(emptyForm(origin));
    setEditing('new');
  };

  const openEdit = (app: MetaApp) => {
    setForm({
      name: app.name,
      description: app.description ?? '',
      app_id: app.app_id,
      api_version: app.api_version,
      config_id: app.config_id ?? '',
      redirect_uri: app.redirect_uri ?? '',
      instagram_app_id: app.instagram_app_id ?? '',
      webhook_verify_token: app.webhook_verify_token ?? '',
      app_secret: '',
      system_token: '',
    });
    setEditing(app);
  };

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (!form.name.trim() || !form.app_id.trim()) {
      toast.error('Informe o nome e o App ID');
      return;
    }
    setSaving(true);
    try {
      const isNew = editing === 'new';
      const res = await fetch(
        isNew ? '/api/platform-admin/apps' : `/api/platform-admin/apps/${(editing as MetaApp).id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar');
      toast.success(isNew ? 'App adicionado' : 'App atualizado');
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (app: MetaApp) => {
    const res = await fetch(`/api/platform-admin/apps/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !app.active }),
    });
    if (!res.ok) return toast.error('Falha ao atualizar');
    await load();
  };

  const remove = async (app: MetaApp) => {
    if (!window.confirm(`Remover o app "${app.name}"?`)) return;
    const res = await fetch(`/api/platform-admin/apps/${app.id}`, { method: 'DELETE' });
    if (!res.ok) return toast.error('Falha ao remover');
    toast.success('App removido');
    await load();
  };

  return (
    <div>
      <SettingsPanelHead
        title="Apps"
        description="Apps Meta da plataforma usados no Cadastro Incorporado do WhatsApp. Visível apenas para o administrador."
        action={
          <Button onClick={openNew}>
            <Plus className="mr-1.5 size-4" />
            Adicionar app
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="space-y-1 p-4 text-sm">
          <div className="font-medium">URL do webhook (configure no app Meta)</div>
          <code className="block break-all text-xs text-muted-foreground">
            {origin}/api/whatsapp/webhook
          </code>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando...
        </div>
      ) : apps.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">Nenhum app cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => (
            <Card key={app.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{app.name}</span>
                    <Badge variant={app.active ? 'default' : 'secondary'}>
                      {app.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    App ID {app.app_id} · {app.api_version} · Config ID{' '}
                    {app.config_id ?? '—'} · Secret {app.has_app_secret ? 'salvo' : 'pendente'} ·
                    Token {app.has_system_token ? 'salvo' : 'pendente'}
                  </div>
                  {app.description ? (
                    <div className="mt-1 text-xs text-muted-foreground">{app.description}</div>
                  ) : null}
                </div>
                <Button variant="outline" size="sm" onClick={() => toggle(app)}>
                  {app.active ? 'Desativar' : 'Ativar'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEdit(app)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => remove(app)}>
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-popover sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Novo app WABA' : 'Editar app WABA'}</DialogTitle>
            <DialogDescription>
              Dados do app Meta usado no Cadastro Incorporado. Segredos em branco mantêm o valor salvo.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome *">
              <Input value={form.name} onChange={set('name')} placeholder="Meu app WhatsApp" />
            </Field>
            <Field label="App ID *">
              <Input value={form.app_id} onChange={set('app_id')} inputMode="numeric" />
            </Field>
            <Field label="Versão da API">
              <select
                value={form.api_version}
                onChange={set('api_version')}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {META_API_VERSIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Config ID (Cadastro Incorporado)">
              <Input value={form.config_id} onChange={set('config_id')} inputMode="numeric" />
            </Field>
            <Field label="App Secret" className="sm:col-span-2">
              <Input
                type="password"
                autoComplete="off"
                value={form.app_secret}
                onChange={set('app_secret')}
                placeholder={editing !== 'new' && (editing as MetaApp)?.has_app_secret ? '•••••• (salvo)' : ''}
              />
            </Field>
            <Field label="Token permanente (usuário do sistema)" className="sm:col-span-2">
              <Input
                type="password"
                autoComplete="off"
                value={form.system_token}
                onChange={set('system_token')}
                placeholder={editing !== 'new' && (editing as MetaApp)?.has_system_token ? '•••••• (salvo)' : ''}
              />
            </Field>
            <Field label="Verify token do webhook" className="sm:col-span-2">
              <Input value={form.webhook_verify_token} onChange={set('webhook_verify_token')} />
            </Field>
            <Field label="Redirect URI" className="sm:col-span-2">
              <Input value={form.redirect_uri} onChange={set('redirect_uri')} />
            </Field>
            <Field label="Instagram App ID (opcional)">
              <Input value={form.instagram_app_id} onChange={set('instagram_app_id')} />
            </Field>
            <Field label="Descrição">
              <Input value={form.description} onChange={set('description')} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      {children}
    </div>
  );
}
