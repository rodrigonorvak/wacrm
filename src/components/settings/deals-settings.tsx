"use client";

import { useTranslations } from "next-intl";

import { SettingsPanelHead } from "./settings-panel-head";

export function DealsSettings() {
  const t = useTranslations("Settings.deals");

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t("title")} description={t("description")} />
      <div className="grid gap-3 border-y border-border py-5 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center">
        <div>
          <p className="text-sm font-medium text-foreground">{t("defaultCurrency")}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("defaultCurrencyDesc")}
          </p>
        </div>
        <p className="text-sm font-medium text-foreground">BRL — {t("currencyBRL")}</p>
      </div>
    </section>
  );
}