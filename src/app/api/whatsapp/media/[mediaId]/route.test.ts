import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getMediaUrl: vi.fn(),
  downloadMedia: vi.fn(),
  decrypt: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/whatsapp/meta-api', () => ({
  getMediaUrl: mocks.getMediaUrl,
  downloadMedia: mocks.downloadMedia,
}))
vi.mock('@/lib/whatsapp/encryption', () => ({ decrypt: mocks.decrypt }))

import { GET } from './route'

function queryResult(data: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  }
  return query
}

beforeEach(() => {
  mocks.createClient.mockReset().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    from: vi.fn((table: string) =>
      table === 'profiles'
        ? queryResult({ account_id: 'account-1' })
        : queryResult({ access_token: 'encrypted-token' }),
    ),
  })
  mocks.getMediaUrl.mockReset().mockResolvedValue({ url: 'https://meta.test/media', mimeType: 'image/jpeg' })
  mocks.downloadMedia.mockReset().mockResolvedValue({ buffer: Buffer.from('media'), contentType: 'image/jpeg' })
  mocks.decrypt.mockReset().mockReturnValue('access-token')
})

describe('WhatsApp media proxy', () => {
  it('does not allow authenticated media responses to enter shared caches', async () => {
    const response = await GET(
      new Request('http://localhost/api/whatsapp/media/media-1'),
      { params: Promise.resolve({ mediaId: 'media-1' }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})
