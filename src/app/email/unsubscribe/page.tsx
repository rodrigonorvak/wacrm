import { EmailUnsubscribeForm } from './unsubscribe-form';

export const dynamic = 'force-dynamic';

export default async function EmailUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token: tokenParam } = await searchParams;
  const token = typeof tokenParam === 'string' ? tokenParam : '';

  return <EmailUnsubscribeForm token={token} />;
}
