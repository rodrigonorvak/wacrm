import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  createSignedUrl: vi.fn(),
}))

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: mocks.getCurrentAccount,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}))
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (path: string, expiresIn: number) =>
          mocks.createSignedUrl(bucket, path, expiresIn),
      }),
    },
  }),
}))

import { GET } from './route'

const ACCOUNT_ID = 'account-1'

beforeEach(() => {
  mocks.getCurrentAccount.mockReset().mockResolvedValue({ accountId: ACCOUNT_ID })
  mocks.createSignedUrl.mockReset().mockResolvedValue({
    data: { signedUrl: 'https://storage.test/signed/object?token=temporary' },
    error: null,
  })
})

describe('private inbound WhatsApp media route', () => {
  it('redirects to a short-lived signed URL for the authenticated account', async () => {
    const response = await GET(new Request('http://localhost/api/whatsapp/inbound-media'), {
      params: Promise.resolve({ path: [`account-${ACCOUNT_ID}`, 'inbound', 'image-1.jpg'] }),
    })

    expect(response.status).toBe(307)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('location')).toBe('https://storage.test/signed/object?token=temporary')
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      'chat-inbound',
      `account-${ACCOUNT_ID}/inbound/image-1.jpg`,
      60,
    )
  })

  it('does not fetch objects belonging to another account', async () => {
    const response = await GET(new Request('http://localhost/api/whatsapp/inbound-media'), {
      params: Promise.resolve({ path: ['account-other', 'inbound', 'image-1.jpg'] }),
    })

    expect(response.status).toBe(404)
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })

  it('rejects non-inbound or traversal paths', async () => {
    const response = await GET(new Request('http://localhost/api/whatsapp/inbound-media'), {
      params: Promise.resolve({ path: [`account-${ACCOUNT_ID}`, '..', '..'] }),
    })

    expect(response.status).toBe(404)
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })
})
