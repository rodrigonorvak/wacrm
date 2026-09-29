interface InviteBaseUrlEnv {
  NEXT_PUBLIC_SITE_URL?: string
  ALLOWED_INVITE_HOSTS?: string
  NODE_ENV?: string
}

function parseAllowedHosts(raw?: string): readonly string[] | null {
  if (!raw?.trim()) return null
  const list = raw
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
  return list.length > 0 ? list : null
}

function isHostAllowed(hostname: string, allowList: readonly string[] | null): boolean {
  return !allowList || allowList.includes(hostname.toLowerCase())
}

export function resolveInviteBaseUrl(
  request: Request,
  env: InviteBaseUrlEnv = process.env,
): string | null {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) {
    try {
      const url = new URL(explicit)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
      return explicit.replace(/\/+$/, '')
    } catch {
      return null
    }
  }

  const allowList = parseAllowedHosts(env.ALLOWED_INVITE_HOSTS)
  const forwardedHost = request.headers
    .get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim()
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()

  if (forwardedHost && isHostAllowed(forwardedHost, allowList)) {
    if (env.NODE_ENV === 'production' && !allowList) return null
    const protocol = forwardedProto || 'https'
    if (protocol !== 'https' && protocol !== 'http') return null
    return `${protocol}://${forwardedHost}`
  }

  const host = request.headers.get('host')?.trim()
  if (host && isHostAllowed(host, allowList)) {
    if (env.NODE_ENV === 'production' && !allowList) return null
    const protocol = new URL(request.url).protocol.replace(':', '')
    return `${protocol}://${host}`
  }

  return null
}
