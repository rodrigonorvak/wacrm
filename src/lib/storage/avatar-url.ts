const AVATAR_PROXY_PREFIX = '/api/account/avatars/'
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const AVATAR_FILE_PATTERN = /^avatar-[0-9]+\.(?:png|jpe?g|webp|gif)$/i

export interface AvatarObject {
  userId: string
  fileName: string
  path: string
}

export function parseAvatarObjectPath(
  value: string | null | undefined,
  expectedUserId?: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): AvatarObject | null {
  if (!value || !supabaseUrl) return null

  let url: URL
  let baseUrl: URL
  try {
    url = new URL(value)
    baseUrl = new URL(supabaseUrl)
  } catch {
    return null
  }

  if (url.origin !== baseUrl.origin) return null
  const marker = '/storage/v1/object/public/avatars/'
  const markerIndex = url.pathname.indexOf(marker)
  if (markerIndex < 0) return null

  let segments: string[]
  try {
    segments = url.pathname
      .slice(markerIndex + marker.length)
      .split('/')
      .map((segment) => decodeURIComponent(segment))
  } catch {
    return null
  }

  if (segments.length !== 2) return null
  const [userId, fileName] = segments
  if (!USER_ID_PATTERN.test(userId) || !AVATAR_FILE_PATTERN.test(fileName)) return null
  if (expectedUserId && userId !== expectedUserId) return null

  return { userId, fileName, path: `${userId}/${fileName}` }
}

export function privateAvatarUrl(
  value: string | null | undefined,
  userId: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  const object = parseAvatarObjectPath(value, userId, supabaseUrl)
  if (!object) return value ?? null

  return `${AVATAR_PROXY_PREFIX}${encodeURIComponent(object.userId)}/${encodeURIComponent(object.fileName)}`
}
