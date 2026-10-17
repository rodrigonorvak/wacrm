import { ForbiddenError, requireRole } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function requireEmailSenderAdmin() {
  const context = await requireRole('admin');
  const admin = supabaseAdmin();
  const [platformAdminResult, featureResult] = await Promise.all([
    admin
      .from('platform_admins')
      .select('active')
      .eq('user_id', context.userId)
      .maybeSingle(),
    admin
      .from('account_feature_access')
      .select('enabled')
      .eq('account_id', context.accountId)
      .eq('feature_key', 'broadcasts')
      .maybeSingle(),
  ]);

  if (platformAdminResult.error || featureResult.error) {
    console.error(
      '[email-senders/access] feature lookup failed:',
      platformAdminResult.error?.message ?? featureResult.error?.message
    );
    throw new Error('Could not verify email sender access');
  }
  if (
    platformAdminResult.data?.active !== true &&
    featureResult.data?.enabled !== true
  ) {
    throw new ForbiddenError('Disparos não está liberado para esta conta.');
  }

  return context;
}
