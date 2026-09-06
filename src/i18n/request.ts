import { getRequestConfig } from 'next-intl/server';

type Messages = typeof import('../../messages/en.json');

export default getRequestConfig(async () => {
  const locale = process.env.NEXT_PUBLIC_APP_LOCALE || 'pt-BR';

  let messages: Messages;
  try {
    const sourceMessages = (await import('../../messages/en.json')).default;
    const translatedMessages = (await import(`../../messages/${locale}.json`)).default;
    messages = mergeMessages(sourceMessages, translatedMessages) as Messages;
  } catch {
    messages = (await import('../../messages/en.json')).default;
  }

  return {
    locale,
    messages
  };
});

function mergeMessages(source: unknown, translation: unknown): unknown {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return translation ?? source;
  }

  if (!translation || typeof translation !== 'object' || Array.isArray(translation)) {
    return source;
  }

  const merged: Record<string, unknown> = { ...(source as Record<string, unknown>) };
  for (const [key, value] of Object.entries(translation)) {
    merged[key] = key in merged ? mergeMessages(merged[key], value) : value;
  }
  return merged;
}
