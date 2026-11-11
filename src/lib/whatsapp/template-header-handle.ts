import { uploadResumableMedia } from '@/lib/whatsapp/meta-api'
import type { TemplatePayload } from '@/lib/whatsapp/template-validators'
import { isDeliverableUrl } from '@/lib/webhooks/ssrf'
import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * Meta requires an `example.header_handle` (from the Resumable Upload
 * API) to create/edit a template with an IMAGE header — a plain public
 * URL is not accepted at creation time. This helper turns the template's
 * `header_media_url` (whether the user uploaded a file or pasted a link)
 * into a handle and writes it onto the payload, so both the upload path
 * and the legacy URL path actually succeed.
 *
 * No-op unless the header is an image that has a URL but no handle yet.
 * Image-only for now (the #230 scope); video/document handles can follow
 * the same shape.
 */

// Meta's image-header sample limits.
const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png']

export type ImageHeaderErrorCode =
  | 'image_app_id_missing'
  | 'image_app_lookup_failed'
  | 'image_unreachable'
  | 'image_http_error'
  | 'image_invalid_type'
  | 'image_empty'
  | 'image_too_large'

export class ImageHeaderError extends Error {
  constructor(
    readonly code: ImageHeaderErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message)
    this.name = 'ImageHeaderError'
  }
}

async function getImageUploadAppId(platformAppId?: string | null): Promise<string> {
  if (platformAppId) {
    const { data, error } = await supabaseAdmin()
      .from('platform_meta_apps')
      .select('app_id')
      .eq('id', platformAppId)
      .maybeSingle()
    if (error) {
      console.error('[template-image] platform app lookup failed:', error.message)
      throw new ImageHeaderError('image_app_lookup_failed', 'Could not load the linked Meta app.')
    }
    if (typeof data?.app_id === 'string' && data.app_id.trim()) {
      return data.app_id.trim()
    }
    throw new ImageHeaderError('image_app_id_missing', 'The linked Meta app has no app ID.')
  }
  const appId = process.env.META_APP_ID?.trim()
  if (!appId) {
    throw new ImageHeaderError(
      'image_app_id_missing',
      'Image-header templates need META_APP_ID set (used for Meta’s Resumable Upload). Add it to your environment, or remove the image header.',
    )
  }
  return appId
}

export async function ensureImageHeaderHandle(
  payload: TemplatePayload,
  accessToken: string,
  platformAppId?: string | null,
): Promise<void> {
  if (payload.header_type !== 'image') return
  if (payload.header_handle) return // already have one
  if (!payload.header_media_url) return // validator already requires url-or-handle

  const appId = await getImageUploadAppId(platformAppId)

  // SSRF guard: `header_media_url` is caller-supplied (any authenticated
  // member can submit a template) and the fetch below happens server-side,
  // so refuse any destination that resolves to a private / loopback /
  // link-local / reserved address. Same guard, same message as the two
  // other outbound-fetch call sites (see lib/webhooks/ssrf.ts) — matching
  // the unreachable-host message keeps the failure from being an oracle.
  if (!(await isDeliverableUrl(payload.header_media_url))) {
    throw new ImageHeaderError('image_unreachable', 'Could not fetch the header image URL. Make sure it is publicly reachable.')
  }

  // Fetch the sample image bytes (works for our uploaded chat-media URL
  // and for a manually-pasted public link).
  let res: Response
  try {
    res = await fetch(payload.header_media_url, {
      // Do NOT follow redirects — a public URL could 3xx-bounce to an
      // internal address, defeating the guard above. Bound the request so
      // a hung host can't tie up the template-submit handler.
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new ImageHeaderError('image_unreachable', 'Could not fetch the header image URL. Make sure it is publicly reachable.')
  }
  if (!res.ok) {
    throw new ImageHeaderError('image_http_error', `Header image URL returned ${res.status}. It must be publicly reachable.`, String(res.status))
  }

  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (contentType && !ALLOWED_IMAGE_TYPES.includes(contentType)) {
    throw new ImageHeaderError('image_invalid_type', `Header image must be JPEG or PNG (got ${contentType}).`, contentType)
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength === 0) {
    throw new ImageHeaderError('image_empty', 'Header image is empty.')
  }
  if (bytes.byteLength > IMAGE_MAX_BYTES) {
    throw new ImageHeaderError(
      'image_too_large',
      `Header image is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB — Meta's limit is 5 MB.`,
      (bytes.byteLength / 1024 / 1024).toFixed(1),
    )
  }

  const mimeType = ALLOWED_IMAGE_TYPES.includes(contentType) ? contentType : 'image/jpeg'
  const fileName = mimeType === 'image/png' ? 'header.png' : 'header.jpg'

  const { handle } = await uploadResumableMedia({
    appId,
    accessToken,
    fileName,
    mimeType,
    bytes,
  })
  payload.header_handle = handle
}
