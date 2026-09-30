import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';

import { SettingsPanelHead } from './settings-panel-head';

function MetaBrandIcon() {
  return (
    <span className="flex size-9 items-center justify-center rounded-md bg-[#1877f2] text-xl font-semibold leading-none text-white" aria-hidden="true">
      ∞
    </span>
  );
}

export function IntegrationsOverview({ onOpenMeta }: { onOpenMeta: () => void }) {
  const [metaConnected, setMetaConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/integrations/meta/config', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result: { integrations?: Array<{ is_active?: boolean }> }) => {
        setMetaConnected(result.integrations?.some((integration) => integration.is_active === true) ?? false);
      })
      .catch(() => setMetaConnected(false));
  }, []);

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Integrações"
        description="Conecte o CRM aos serviços que sua operação usa para captar e acompanhar leads."
      />
      <section className="border-y border-border">
        <header className="py-4">
          <h3 className="text-sm font-medium text-foreground">Integrações disponíveis</h3>
          <p className="mt-1 text-xs text-muted-foreground">Escolha uma integração para configurar.</p>
        </header>
        <button
          type="button"
          onClick={onOpenMeta}
          className="flex w-full items-center gap-4 border-t border-border py-4 text-left transition-colors hover:bg-muted/30"
        >
          <MetaBrandIcon />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">Meta</span>
            <span className="mt-1 block text-sm text-muted-foreground">Conversões, Elementor e Meta Instant Forms</span>
            <span className={metaConnected ? 'mt-1 flex items-center gap-1.5 text-xs text-emerald-600' : 'mt-1 flex items-center gap-1.5 text-xs text-muted-foreground'}>
              <span className={metaConnected ? 'size-1.5 rounded-full bg-emerald-500' : 'size-1.5 rounded-full bg-muted-foreground'} aria-hidden="true" />
              {metaConnected === null ? 'Verificando...' : metaConnected ? 'Conectado' : 'Precisa ser reconectado'}
            </span>
          </span>
          <span className="flex size-8 items-center justify-center text-muted-foreground" aria-hidden="true">
            <ArrowRight className="size-4" />
          </span>
        </button>
      </section>
    </section>
  );
}