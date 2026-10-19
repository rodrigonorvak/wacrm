import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createUser: vi.fn(),
  updateUserById: vi.fn(),
  deleteUser: vi.fn(),
  profile: vi.fn(),
  profileByEmail: vi.fn(),
  updateProfile: vi.fn(),
  promotedProfile: vi.fn(),
  deleteCreationRequest: vi.fn(),
}));

vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: vi.fn(),
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() =>
    Response.json({ error: 'auth failed' }, { status: 403 })
  ),
}));
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        createUser: mocks.createUser,
        updateUserById: mocks.updateUserById,
        deleteUser: mocks.deleteUser,
      },
    },
    from: (table: string) => {
      if (table === 'account_creation_requests') {
        return {
          delete: () => ({
            eq: mocks.deleteCreationRequest,
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: mocks.profile }),
          ilike: () => ({ maybeSingle: mocks.profileByEmail }),
        }),
        update: mocks.updateProfile,
      };
    },
  }),
}));

import { POST } from './route';

const ACCOUNT_ID = 'account-1';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const TEMP_PASSWORD = 'Temporary-Password-47';

beforeEach(() => {
  mocks.requireRole.mockReset().mockResolvedValue({
    userId: 'admin-1',
    accountId: ACCOUNT_ID,
    role: 'admin',
  });
  mocks.createUser.mockReset().mockResolvedValue({
    data: {
      user: {
        id: USER_ID,
        app_metadata: { provider: 'email', providers: ['email'] },
      },
    },
    error: null,
  });
  mocks.profile.mockReset().mockResolvedValue({
    data: { user_id: USER_ID, account_id: ACCOUNT_ID, account_role: 'agent' },
    error: null,
  });
  mocks.profileByEmail
    .mockReset()
    .mockResolvedValue({ data: null, error: null });
  mocks.updateProfile.mockReset().mockImplementation(() => ({
    eq: () => ({
      eq: () => ({
        select: () => ({ maybeSingle: mocks.promotedProfile }),
      }),
    }),
  }));
  mocks.promotedProfile.mockReset().mockResolvedValue({
    data: { user_id: USER_ID },
    error: null,
  });
  mocks.deleteCreationRequest.mockReset().mockResolvedValue({ error: null });
  mocks.updateUserById.mockReset().mockResolvedValue({ error: null });
  mocks.deleteUser.mockReset().mockResolvedValue({ error: null });
});

function request(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/account/members', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/account/members', () => {
  it('creates the user through Admin API with trusted tenant role and immediate access', async () => {
    const response = await request({
      email: 'member@example.com',
      password: TEMP_PASSWORD,
      full_name: 'New Teammate',
      role: 'agent',
    });
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: 'member@example.com',
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'New Teammate' },
      app_metadata: {
        member_provisioning_account_id: ACCOUNT_ID,
        member_provisioning_role: 'agent',
      },
    });
    expect(result.member).toMatchObject({
      user_id: USER_ID,
      email: 'member@example.com',
      role: 'agent',
      requires_password_change: false,
    });
    expect(JSON.stringify(result)).not.toContain(TEMP_PASSWORD);
    expect(mocks.updateUserById).toHaveBeenCalledWith(USER_ID, {
      app_metadata: {
        provider: 'email',
        providers: ['email'],
      },
    });
  });

  it('turns a pending Google signup into an approved member of the current account', async () => {
    mocks.createUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'email_exists' },
    });
    mocks.profileByEmail.mockResolvedValue({
      data: {
        user_id: USER_ID,
        account_id: 'pending-account',
        account_role: 'owner',
        access_status: 'pending',
      },
      error: null,
    });

    const response = await request({
      email: 'member@example.com',
      password: TEMP_PASSWORD,
      full_name: 'New Teammate',
      role: 'agent',
    });
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.updateUserById).toHaveBeenCalledWith(USER_ID, {
      password: TEMP_PASSWORD,
      email_confirm: true,
    });
    expect(mocks.updateProfile).toHaveBeenCalledWith({
      full_name: 'New Teammate',
      email: 'member@example.com',
      account_id: ACCOUNT_ID,
      account_role: 'agent',
      access_status: 'approved',
    });
    expect(result.member).toMatchObject({
      user_id: USER_ID,
      email: 'member@example.com',
      role: 'agent',
      requires_password_change: false,
    });
    expect(mocks.deleteCreationRequest).toHaveBeenCalledWith(
      'user_id',
      USER_ID
    );
  });

  it('does not take over an already approved account with the same email', async () => {
    mocks.createUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'email_exists' },
    });
    mocks.profileByEmail.mockResolvedValue({
      data: {
        user_id: USER_ID,
        account_id: 'approved-account',
        account_role: 'agent',
        access_status: 'approved',
      },
      error: null,
    });

    const response = await request({
      email: 'member@example.com',
      password: TEMP_PASSWORD,
      role: 'agent',
    });

    expect(response.status).toBe(409);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('rejects owner role and never calls Auth Admin for invalid input', async () => {
    const response = await request({
      email: 'member@example.com',
      password: TEMP_PASSWORD,
      role: 'owner',
    });

    expect(response.status).toBe(400);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it('deletes the Auth user if trigger provisioning did not attach the expected account role', async () => {
    mocks.profile.mockResolvedValue({
      data: {
        user_id: USER_ID,
        account_id: 'account-other',
        account_role: 'agent',
      },
      error: null,
    });

    const response = await request({
      email: 'member@example.com',
      password: TEMP_PASSWORD,
      role: 'agent',
    });

    expect(response.status).toBe(500);
    expect(mocks.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
});
