import { ArrowRight } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';

function MetaBrandIcon() {
  return (
    <span className="flex size-10 items-center justify-center rounded-xl bg-[#1877f2] text-2xl font-semibold leading-none text-white" aria-hidden="true">
      ∞
    </span>
  );
}

export function IntegrationsOverview({ onOpenMeta }: { onOpenMeta: () => void }) {
  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Integrações"
        description="Conecte o CRM aos serviços que sua operação usa para captar e acompanhar leads."
      />
      <Card>
        <CardHeader>
          <CardTitle>Integrações disponíveis</CardTitle>
          <CardDescription>Escolha uma integração para configurar.</CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={onOpenMeta}
            className="flex w-full items-center gap-4 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted"
          >
            <MetaBrandIcon />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-foreground">Meta</span>
              <span className="mt-1 block text-sm text-muted-foreground">Conversões, Elementor e Meta Instant Forms</span>
            </span>
            <span className="flex size-8 items-center justify-center rounded-lg text-muted-foreground" aria-hidden="true">
              <ArrowRight className="size-4" />
            </span>
          </button>
        </CardContent>
      </Card>
    </section>
  );
}