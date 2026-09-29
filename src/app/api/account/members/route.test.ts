import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createUser: vi.fn(),
  updateUserById: vi.fn(),
  deleteUser: vi.fn(),
  profile: vi.fn(),
}))

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: vi.fn(),
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}))
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        createUser: mocks.createUser,
        updateUserById: mocks.updateUserById,
        deleteUser: mocks.deleteUser,
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.profile }),
      }),
    }),
  }),
}))

import { POST } from './route'

const ACCOUNT_ID = 'account-1'
const USER_ID = '11111111-2222-3333-4444-555555555555'
const TEMP_PASSWORD = 'Temporary-Password-47'

beforeEach(() => {
  mocks.requireRole.mockReset().mockResolvedValue({
    userId: 'admin-1',
    accountId: ACCOUNT_ID,
    role: 'admin',
  })
  mocks.createUser.mockReset().mockResolvedValue({
    data: {
      user: {
        id: USER_ID,
        app_metadata: { provider: 'email', providers: ['email'] },
      },
    },
    error: null,
  })
  mocks.profile.mockReset().mockResolvedValue({
    data: { user_id: USER_ID, account_id: ACCOUNT_ID, account_role: 'agent' },
    error: null,
  })
  mocks.updateUserById.mockReset().mockResolvedValue({ error: null })
  mocks.deleteUser.mockReset().mockResolvedValue({ error: null })
})

function request(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/account/members', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

describe('POST /api/account/members', () => {
  it('creates the user through Admin API with trusted tenant role and forced password change', async () => {
    const response = await request({
      email: 'member@example.com',
      password: TEMP_PASSWORD,
      full_name: 'New Teammate',
      role: 'agent',
    })
    const result = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: 'member@example.com',
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'New Teammate' },
      app_metadata: {
        must_change_password: true,
        member_provisioning_account_id: ACCOUNT_ID,
        member_provisioning_role: 'agent',
      },
    })
    expect(result.member).toMatchObject({
      user_id: USER_ID,
      email: 'member@example.com',
      role: 'agent',
      requires_password_change: true,
    })
    expect(JSON.stringify(result)).not.toContain(TEMP_PASSWORD)
    expect(mocks.updateUserById).toHaveBeenCalledWith(USER_ID, {
      app_metadata: {
        provider: 'email',
        providers: ['email'],
        must_change_password: true,
      },
    })
  })

  it('rejects owner role and never calls Auth Admin for invalid input', async () => {
    const response = await request({
      email: 'member@example.com',
      password: TEMP_PASSWORD,
      role: 'owner',
    })

    expect(response.status).toBe(400)
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('deletes the Auth user if trigger provisioning did not attach the expected account role', async () => {
    mocks.profile.mockResolvedValue({
      data: { user_id: USER_ID, account_id: 'account-other', account_role: 'agent' },
      error: null,
    })

    const response = await request({
      email: 'member@example.com',
      password: TEMP_PASSWORD,
      role: 'agent',
    })

    expect(response.status).toBe(500)
    expect(mocks.deleteUser).toHaveBeenCalledWith(USER_ID)
    expect(mocks.updateUserById).not.toHaveBeenCalled()
  })
})
