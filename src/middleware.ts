import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  const requiresPasswordChange = user?.app_metadata?.must_change_password === true
  const isPasswordChangePage = request.nextUrl.pathname === '/change-password'
  const isPasswordChangeApi = request.nextUrl.pathname === '/api/auth/change-password'
  if (requiresPasswordChange && !isPasswordChangePage && !isPasswordChangeApi) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return withRefreshedCookies(
        NextResponse.json(
          { error: 'Change your temporary password before using the CRM' },
          { status: 403 },
        ),
      )
    }
    const url = request.nextUrl.clone()
    url.pathname = '/change-password'
    url.search = ''
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  const isApprovalPage = ['/signup/complete', '/account-pending', '/account-denied'].some(
    path => request.nextUrl.pathname.startsWith(path),
  )
  if (user && !isApprovalPage && !request.nextUrl.pathname.startsWith('/auth/')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('access_status')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profile?.access_status === 'pending') {
      const { data: creationRequest } = await supabase
        .from('account_creation_requests')
        .select('company, phone')
        .eq('user_id', user.id)
        .maybeSingle()
      const needsDetails = !creationRequest?.company || !creationRequest?.phone
      const url = request.nextUrl.clone()
      url.pathname = needsDetails ? '/signup/complete' : '/account-pending'
      url.search = ''
      return withRefreshedCookies(NextResponse.redirect(url))
    }
    if (!profile || profile.access_status !== 'approved') {
      const url = request.nextUrl.clone()
      url.pathname = '/account-denied'
      url.search = ''
      return withRefreshedCookies(NextResponse.redirect(url))
    }
  }

  if (user && request.nextUrl.pathname === '/account-pending') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('access_status')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profile?.access_status === 'pending') {
      const { data: creationRequest } = await supabase
        .from('account_creation_requests')
        .select('company, phone')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!creationRequest?.company || !creationRequest?.phone) {
        const url = request.nextUrl.clone()
        url.pathname = '/signup/complete'
        url.search = ''
        return withRefreshedCookies(NextResponse.redirect(url))
      }
    }
  }

  // Auth pages - redirect to dashboard if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /dashboard.
  if (user && (
    request.nextUrl.pathname === '/login' ||
    (request.nextUrl.pathname === '/signup' && !request.nextUrl.pathname.startsWith('/signup/')) ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      url.pathname = '/dashboard'
      url.search = ''
    }
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Protected pages - redirect to login if not authenticated
  const protectedPaths = ['/dashboard', '/inbox', '/contacts', '/pipelines', '/broadcasts', '/automations', '/settings', '/change-password']
  if (!user && protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // API routes that need auth (not webhooks)
  if (!user && request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
      !request.nextUrl.pathname.includes('/webhook')) {
    return withRefreshedCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
