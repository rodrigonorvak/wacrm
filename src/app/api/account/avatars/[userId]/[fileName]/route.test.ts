import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  createSignedUrl: vi.fn(),
  profileQuery: vi.fn(),
  profileFilters: [] as [string, unknown][],
}))

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: mocks.getCurrentAccount,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}))
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (path: string, seconds: number) => mocks.createSignedUrl(bucket, path, seconds),
      }),
    },
  }),
}))

import { GET } from './route'

const USER_ID = '11111111-2222-3333-4444-555555555555'
const OTHER_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AVATAR_URL = `https://project.supabase.co/storage/v1/object/public/avatars/${USER_ID}/avatar-123.png`

beforeEach(() => {
  mocks.profileFilters.length = 0
  mocks.getCurrentAccount.mockReset().mockResolvedValue({
    accountId: 'account-a',
    supabase: {
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn((column: string, value: unknown) => {
            mocks.profileFilters.push([column, value])
            return query
          }),
          maybeSingle: mocks.profileQuery,
        }
        return query
      }),
    },
  })
  mocks.profileQuery.mockReset().mockResolvedValue({ data: { avatar_url: AVATAR_URL }, error: null })
  mocks.createSignedUrl.mockReset().mockResolvedValue({
    data: { signedUrl: 'https://project.supabase.co/storage/v1/object/sign/avatars/x?token=short-lived' },
    error: null,
  })
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
})

function request(userId = USER_ID, fileName = 'avatar-123.png') {
  return GET(new Request('http://localhost/api/account/avatars'), {
    params: Promise.resolve({ userId, fileName }),
  })
}

describe('account avatar signed URL route', () => {
  it('issues a short-lived URL for a profile in the current account', async () => {
    const response = await request()

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('short-lived')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.profileFilters).toContainEqual(['user_id', USER_ID])
    expect(mocks.profileFilters).toContainEqual(['account_id', 'account-a'])
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('avatars', `${USER_ID}/avatar-123.png`, 60)
  })

  it('does not sign a file that is not the profile avatar', async () => {
    const response = await request(USER_ID, 'avatar-999.png')

    expect(response.status).toBe(404)
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })

  it('does not return an avatar when the account-scoped profile lookup finds none', async () => {
    mocks.profileQuery.mockResolvedValue({ data: null, error: null })

    const response = await request(OTHER_USER)

    expect(response.status).toBe(404)
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })
})
