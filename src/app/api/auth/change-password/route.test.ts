import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  updateUserById: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser, signOut: mocks.signOut },
  }),
}))
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({ auth: { admin: { updateUserById: mocks.updateUserById } } }),
}))

import { POST } from './route'

const USER = {
  id: 'user-1',
  app_metadata: { provider: 'email', must_change_password: true },
}

beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: USER }, error: null })
  mocks.signOut.mockReset().mockResolvedValue({ error: null })
  mocks.updateUserById.mockReset().mockResolvedValue({ error: null })
})

function request(password: string) {
  return POST(new Request('http://localhost/api/auth/change-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  }))
}

describe('POST /api/auth/change-password', () => {
  it('changes only the authenticated user password and clears the forced-change flag', async () => {
    const password = 'New-Private-Password-74'
    const response = await request(password)

    expect(response.status).toBe(200)
    expect(mocks.updateUserById).toHaveBeenCalledWith('user-1', {
      password,
      app_metadata: { provider: 'email', must_change_password: false },
    })
    expect(await response.json()).toEqual({ ok: true })
    expect(mocks.signOut).toHaveBeenCalledOnce()
  })

  it('rejects passwords below the minimum without calling Admin API', async () => {
    const response = await request('short')

    expect(response.status).toBe(400)
    expect(mocks.updateUserById).not.toHaveBeenCalled()
  })

  it('refuses to clear the gate when this is not a provisioned member', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', app_metadata: { provider: 'email' } } },
      error: null,
    })

    const response = await request('New-Private-Password-74')

    expect(response.status).toBe(409)
    expect(mocks.updateUserById).not.toHaveBeenCalled()
  })
})
