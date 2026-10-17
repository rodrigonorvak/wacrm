'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Loader2, MailCheck } from 'lucide-react';

export function EmailUnsubscribeForm({ token }: { token: string }) {
  const t = useTranslations('EmailUnsubscribe');
  const [status, setStatus] = useState<
    'ready' | 'submitting' | 'success' | 'error'
  >(token ? 'ready' : 'error');

  async function confirmUnsubscribe() {
    setStatus('submitting');
    try {
      const response = await fetch('/api/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error(t('failedDescription'));
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  const succeeded = status === 'success';
  const failed = status === 'error';

  return (
    <main className="bg-background flex min-h-screen items-center justify-center px-4 py-10">
      <section className="border-border bg-card w-full max-w-lg rounded-2xl border p-8 text-center shadow-sm">
        <MailCheck className="text-primary mx-auto size-10" />
        <h1 className="text-foreground mt-4 text-2xl font-bold">
          {succeeded
            ? t('successTitle')
            : failed
              ? t('invalidTitle')
              : t('title')}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          {succeeded
            ? t('successDescription')
            : failed
              ? token
                ? t('failedDescription')
                : t('invalidDescription')
              : t('description')}
        </p>
        {status === 'ready' ||
        status === 'submitting' ||
        (failed && Boolean(token)) ? (
          <Button
            type="button"
            className="mt-6"
            onClick={() => void confirmUnsubscribe()}
            disabled={status === 'submitting'}
          >
            {status === 'submitting' ? (
              <Loader2 className="animate-spin" />
            ) : null}
            {status === 'submitting'
              ? t('confirming')
              : failed
                ? t('retry')
                : t('confirm')}
          </Button>
        ) : null}
      </section>
    </main>
  );
}
