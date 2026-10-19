import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }
  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (!code) {
    const error =
      requestUrl.searchParams.get('error_description') ??
      requestUrl.searchParams.get('error') ??
      'Não foi possível concluir o login com Google';
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, requestUrl.origin)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] OAuth exchange failed:', error.message);
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent('Não foi possível concluir o login com Google')}`,
        requestUrl.origin
      )
    );
  }

  const { data: authUserData } = await supabase.auth.getUser();
  const authUser = authUserData.user;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('access_status, avatar_url')
    .eq('user_id', authUser?.id ?? '')
    .maybeSingle();

  // Members created with a password get a Gravatar placeholder; use the
  // Google photo once they sign in with Google, without overriding uploads.
  const googlePicture =
    (authUser?.user_metadata?.avatar_url as string | undefined) ??
    (authUser?.user_metadata?.picture as string | undefined);
  if (
    authUser &&
    googlePicture?.startsWith('https://') &&
    (!profile?.avatar_url || profile.avatar_url.includes('gravatar.com'))
  ) {
    await supabaseAdmin()
      .from('profiles')
      .update({ avatar_url: googlePicture })
      .eq('user_id', authUser.id);
  }

  if (profileError) {
    console.error(
      '[auth/callback] profile status lookup failed:',
      profileError.message
    );
    return NextResponse.redirect(
      new URL(
        '/login?error=Não foi possível carregar o status da conta',
        requestUrl.origin
      )
    );
  }

  if (profile?.access_status === 'pending') {
    const { data: request } = await supabase
      .from('account_creation_requests')
      .select('company, phone')
      .maybeSingle();
    const destination =
      request && (!request.company || !request.phone)
        ? '/signup/complete'
        : '/account-pending';
    return NextResponse.redirect(new URL(destination, requestUrl.origin));
  }

  if (profile?.access_status === 'denied') {
    return NextResponse.redirect(
      new URL('/account-status?reason=denied', requestUrl.origin)
    );
  }

  if (profile?.access_status === 'suspended') {
    return NextResponse.redirect(
      new URL('/account-status?reason=suspended', requestUrl.origin)
    );
  }

  if (profile?.access_status === 'deleted') {
    return NextResponse.redirect(
      new URL('/account-status?reason=deleted', requestUrl.origin)
    );
  }

  return NextResponse.redirect(
    new URL(
      safeNextPath(requestUrl.searchParams.get('next')),
      requestUrl.origin
    )
  );
}
