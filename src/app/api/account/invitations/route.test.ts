import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  insert: vi.fn(),
}))

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}))

import { POST } from './route'

beforeEach(() => {
  mocks.insert.mockReset()
  mocks.requireRole.mockReset().mockResolvedValue({
    userId: 'user-1',
    accountId: 'account-1',
    role: 'admin',
    supabase: {
      from: vi.fn(() => ({ insert: mocks.insert })),
    },
  })
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
  vi.stubEnv('ALLOWED_INVITE_HOSTS', '')
  vi.stubEnv('NODE_ENV', 'production')
})

describe('POST /api/account/invitations domain validation', () => {
  it('fails closed before inserting when no trusted production host is configured', async () => {
    const response = await POST(
      new Request('https://attacker.example/api/account/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'attacker.example' },
        body: JSON.stringify({ role: 'agent' }),
      }),
    )

    expect(response.status).toBe(503)
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
