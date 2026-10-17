'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Provider = 'gmail_smtp' | 'custom_smtp';

interface EmailSender {
  id: string;
  name: string;
  provider: Provider;
  from_email: string;
  from_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_secure: boolean;
}

interface SenderForm {
  name: string;
  provider: Provider;
  fromEmail: string;
  fromName: string;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpSecure: boolean;
  password: string;
}

const emptyForm: SenderForm = {
  name: '',
  provider: 'gmail_smtp',
  fromEmail: '',
  fromName: '',
  smtpHost: 'smtp.gmail.com',
  smtpPort: '465',
  smtpUsername: '',
  smtpSecure: true,
  password: '',
};

export default function EmailSenderSettingsPage() {
  const t = useTranslations('EmailSenders');
  const router = useRouter();
  const [senders, setSenders] = useState<EmailSender[]>([]);
  const [form, setForm] = useState<SenderForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testAddresses, setTestAddresses] = useState<Record<string, string>>(
    {}
  );

  const loadSenders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/email/senders', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t('loadFailed'));
      setSenders(payload.senders ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadSenders();
  }, [loadSenders]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(sender: EmailSender) {
    setEditingId(sender.id);
    setForm({
      name: sender.name,
      provider: sender.provider,
      fromEmail: sender.from_email,
      fromName: sender.from_name,
      smtpHost: sender.smtp_host,
      smtpPort: String(sender.smtp_port),
      smtpUsername: sender.smtp_username,
      smtpSecure: sender.smtp_secure,
      password: '',
    });
    setShowForm(true);
  }

  function changeProvider(provider: Provider) {
    setForm((current) => ({
      ...current,
      provider,
      smtpHost: provider === 'gmail_smtp' ? 'smtp.gmail.com' : '',
      smtpPort: provider === 'gmail_smtp' ? '465' : '587',
      smtpSecure: provider === 'gmail_smtp',
    }));
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(
        editingId ? `/api/email/senders/${editingId}` : '/api/email/senders',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            smtpPort: Number(form.smtpPort),
            password: form.password || undefined,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t('saveFailed'));
      toast.success(editingId ? t('updated') : t('created'));
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await loadSenders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(sender: EmailSender) {
    if (!window.confirm(t('deleteConfirm', { name: sender.name }))) return;
    setDeletingId(sender.id);
    try {
      const response = await fetch(`/api/email/senders/${sender.id}`, {
        method: 'DELETE',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t('deleteFailed'));
      toast.success(t('deleted'));
      setSenders((current) => current.filter((item) => item.id !== sender.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleTest(sender: EmailSender) {
    const to = testAddresses[sender.id]?.trim();
    if (!to) {
      toast.error(t('testAddressRequired'));
      return;
    }
    setTestingId(sender.id);
    try {
      const response = await fetch(`/api/email/senders/${sender.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t('testFailed'));
      toast.success(t('testSent', { to }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('testFailed'));
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button
        type="button"
        variant="ghost"
        onClick={() => router.push('/broadcasts/email')}
        className="-ml-2"
      >
        <ArrowLeft />
        {t('back')}
      </Button>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-primary text-sm font-medium">{t('section')}</p>
          <h1 className="text-foreground mt-1 text-2xl font-bold">
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {t('description')}
          </p>
        </div>
        {!showForm && (
          <Button type="button" onClick={startCreate}>
            <Plus />
            {t('addSender')}
          </Button>
        )}
      </header>

      <section className="border-border bg-card text-muted-foreground rounded-xl border p-4 text-sm">
        <p>{t('securityNote')}</p>
        <p className="mt-2">{t('gmailNote')}</p>
      </section>

      {showForm && (
        <form
          onSubmit={handleSave}
          className="border-border bg-card space-y-5 rounded-xl border p-5"
        >
          <div>
            <h2 className="text-foreground font-semibold">
              {editingId ? t('editSender') : t('newSender')}
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {t('formHint')}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="sender-name">{t('connectionName')}</Label>
              <Input
                id="sender-name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                maxLength={80}
                required
                placeholder={t('connectionNamePlaceholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sender-provider">{t('provider')}</Label>
              <select
                id="sender-provider"
                value={form.provider}
                onChange={(event) =>
                  changeProvider(event.target.value as Provider)
                }
                className="border-border bg-background text-foreground h-9 rounded-lg border px-3 text-sm"
              >
                <option value="gmail_smtp">{t('gmail')}</option>
                <option value="custom_smtp">{t('customSmtp')}</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sender-from-email">{t('fromEmail')}</Label>
              <Input
                id="sender-from-email"
                type="email"
                autoComplete="email"
                value={form.fromEmail}
                onChange={(event) =>
                  setForm({ ...form, fromEmail: event.target.value })
                }
                required
                maxLength={254}
                placeholder="comercial@malybo.com.br"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sender-from-name">{t('fromName')}</Label>
              <Input
                id="sender-from-name"
                value={form.fromName}
                onChange={(event) =>
                  setForm({ ...form, fromName: event.target.value })
                }
                maxLength={120}
                placeholder="Malybo"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sender-smtp-username">{t('smtpUsername')}</Label>
              <Input
                id="sender-smtp-username"
                value={form.smtpUsername}
                onChange={(event) =>
                  setForm({ ...form, smtpUsername: event.target.value })
                }
                required
                maxLength={254}
                autoComplete="username"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sender-password">
                {editingId ? t('newPasswordOptional') : t('smtpPassword')}
              </Label>
              <Input
                id="sender-password"
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                required={!editingId}
                autoComplete="new-password"
                placeholder={editingId ? t('leaveBlankToKeep') : ''}
              />
            </div>
            {form.provider === 'gmail_smtp' ? (
              <div className="grid gap-2">
                <Label htmlFor="sender-gmail-port">{t('smtpPort')}</Label>
                <select
                  id="sender-gmail-port"
                  value={form.smtpPort}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      smtpPort: event.target.value,
                      smtpSecure: event.target.value === '465',
                    })
                  }
                  className="border-border bg-background text-foreground h-9 rounded-lg border px-3 text-sm"
                >
                  <option value="465">{t('sslPort')}</option>
                  <option value="587">{t('startTlsPort')}</option>
                </select>
                <span className="text-muted-foreground text-xs">
                  {t('gmailAppPasswordHint')}
                </span>
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary w-fit text-xs underline underline-offset-4"
                >
                  {t('createGmailAppPassword')}
                </a>
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="sender-smtp-host">{t('smtpHost')}</Label>
                  <Input
                    id="sender-smtp-host"
                    value={form.smtpHost}
                    onChange={(event) =>
                      setForm({ ...form, smtpHost: event.target.value })
                    }
                    required
                    placeholder="smtp.exemplo.com"
                    autoComplete="url"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sender-smtp-port">{t('smtpPort')}</Label>
                  <Input
                    id="sender-smtp-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={form.smtpPort}
                    onChange={(event) =>
                      setForm({ ...form, smtpPort: event.target.value })
                    }
                    required
                  />
                </div>
                <label className="text-foreground flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.smtpSecure}
                    onChange={(event) =>
                      setForm({ ...form, smtpSecure: event.target.checked })
                    }
                    className="accent-primary size-4"
                  />
                  {t('secureConnection')}
                </label>
              </>
            )}
          </div>

          <div className="border-border flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              disabled={saving}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              {saving ? t('saving') : t('saveSender')}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="text-primary size-6 animate-spin" />
        </div>
      ) : senders.length === 0 ? (
        <div className="border-border bg-card flex flex-col items-center rounded-xl border border-dashed py-12 text-center">
          <Mail className="text-muted-foreground size-9" />
          <p className="text-foreground mt-3 font-medium">{t('emptyTitle')}</p>
          <p className="text-muted-foreground mt-1 max-w-md text-sm">
            {t('emptyDescription')}
          </p>
          {!showForm && (
            <Button type="button" className="mt-4" onClick={startCreate}>
              <Plus />
              {t('addSender')}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {senders.map((sender) => (
            <article
              key={sender.id}
              className="border-border bg-card rounded-xl border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-foreground truncate font-semibold">
                    {sender.name}
                  </h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {sender.from_name ? `${sender.from_name} · ` : ''}
                    {sender.from_email}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {sender.provider === 'gmail_smtp'
                      ? t('gmail')
                      : t('customSmtp')}
                    {' · '}
                    {sender.smtp_host}:{sender.smtp_port}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => startEdit(sender)}
                  >
                    <Pencil />
                    {t('edit')}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    aria-label={t('delete')}
                    onClick={() => void handleDelete(sender)}
                    disabled={deletingId === sender.id}
                  >
                    {deletingId === sender.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                  </Button>
                </div>
              </div>
              <div className="border-border mt-4 flex flex-wrap items-end gap-2 border-t pt-3">
                <div className="grid min-w-56 flex-1 gap-2">
                  <Label htmlFor={`test-to-${sender.id}`}>
                    {t('testRecipient')}
                  </Label>
                  <Input
                    id={`test-to-${sender.id}`}
                    type="email"
                    value={testAddresses[sender.id] ?? ''}
                    onChange={(event) =>
                      setTestAddresses((current) => ({
                        ...current,
                        [sender.id]: event.target.value,
                      }))
                    }
                    placeholder={t('testRecipientPlaceholder')}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleTest(sender)}
                  disabled={testingId === sender.id}
                >
                  {testingId === sender.id ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Send />
                  )}
                  {testingId === sender.id ? t('sendingTest') : t('sendTest')}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
