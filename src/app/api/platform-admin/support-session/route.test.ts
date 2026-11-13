import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  getPlatformAdminSupportSession: vi.fn(),
  supabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
  getPlatformAdminSupportSession: mocks.getPlatformAdminSupportSession,
}))
vi.mock('@/lib/auth/account', () => ({
  toErrorResponse: vi.fn(() => Response.json({ error: 'forbidden' }, { status: 403 })),
}))
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}))

import { DELETE, GET, POST } from './route'

beforeEach(() => {
  mocks.requirePlatformAdmin.mockReset().mockResolvedValue({
    userId: 'platform-user',
    role: 'super_admin',
  })
  mocks.getPlatformAdminSupportSession.mockReset().mockResolvedValue(null)
  mocks.supabaseAdmin.mockReset()
})

describe('/api/platform-admin/support-session', () => {
  it('only lets super administrators check, start, or end a customer access session', async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({
      userId: 'support-user',
      role: 'support',
    })

    const getResponse = await GET()
    const postResponse = await POST(new Request('https://crm.example', {
      method: 'POST',
      body: JSON.stringify({ accountId: '11111111-2222-4333-8444-555555555555' }),
    }))
    const deleteResponse = await DELETE()

    expect([getResponse?.status, postResponse?.status, deleteResponse?.status]).toEqual([403, 403, 403])
    expect(mocks.supabaseAdmin).not.toHaveBeenCalled()
  })

  it('rejects invalid account ids before accessing the database', async () => {
    const response = await POST(new Request('https://crm.example', {
      method: 'POST',
      body: JSON.stringify({ accountId: 'not-an-account-id' }),
    }))

    if (!response) throw new Error('POST did not return a response')
    expect(response.status).toBe(400)
    expect(mocks.supabaseAdmin).not.toHaveBeenCalled()
  })

  it('returns the active session without caching it', async () => {
    const session = {
      id: 'session-1',
      accountId: '11111111-2222-4333-8444-555555555555',
      accountName: 'Customer',
      expiresAt: '2026-11-13T15:00:00Z',
    }
    mocks.getPlatformAdminSupportSession.mockResolvedValue(session)

    const response = await GET()

    if (!response) throw new Error('GET did not return a response')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ session })
  })
})
