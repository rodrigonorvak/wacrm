import { enUS, ko, ptBR } from "date-fns/locale";

export function inboxDateLocale(locale: string) {
  const language = locale.toLowerCase().split(/[-_]/)[0];
  if (language === "pt") return ptBR;
  if (language === "ko") return ko;
  return enUS;
}
