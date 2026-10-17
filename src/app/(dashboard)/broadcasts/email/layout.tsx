import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ForbiddenError, UnauthorizedError } from '@/lib/auth/account';
import { requireEmailSenderAdmin } from '@/lib/email-senders/access';

export default async function EmailCampaignsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  try {
    await requireEmailSenderAdmin();
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthorizedError) {
      redirect('/broadcasts');
    }
    throw error;
  }

  return children;
}
