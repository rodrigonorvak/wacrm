import { describe, expect, it } from 'vitest'
import { resolveInviteBaseUrl } from './invite-base-url'

function request(headers: Record<string, string> = {}) {
  return new Request('https://crm.example/api/account/invitations', { headers })
}

describe('resolveInviteBaseUrl', () => {
  it('prefers a configured canonical URL', () => {
    expect(
      resolveInviteBaseUrl(request({ host: 'attacker.example' }), {
        NEXT_PUBLIC_SITE_URL: 'https://crm.example/',
        NODE_ENV: 'production',
      }),
    ).toBe('https://crm.example')
  })

  it('rejects host-derived URLs in production without an allowlist', () => {
    expect(
      resolveInviteBaseUrl(request({ host: 'attacker.example' }), {
        NODE_ENV: 'production',
      }),
    ).toBeNull()
    expect(
      resolveInviteBaseUrl(request({
        'x-forwarded-host': 'attacker.example',
        'x-forwarded-proto': 'https',
      }), { NODE_ENV: 'production' }),
    ).toBeNull()
  })

  it('accepts only explicitly allow-listed hosts in production', () => {
    expect(
      resolveInviteBaseUrl(request({ host: 'crm.example' }), {
        ALLOWED_INVITE_HOSTS: 'crm.example, app.example',
        NODE_ENV: 'production',
      }),
    ).toBe('https://crm.example')
    expect(
      resolveInviteBaseUrl(request({ host: 'attacker.example' }), {
        ALLOWED_INVITE_HOSTS: 'crm.example',
        NODE_ENV: 'production',
      }),
    ).toBeNull()
  })

  it('keeps request-host behavior available in development', () => {
    expect(resolveInviteBaseUrl(request({ host: 'localhost:3000' }), {
      NODE_ENV: 'development',
    })).toBe('https://localhost:3000')
  })

  it('rejects malformed or non-http canonical URLs', () => {
    expect(resolveInviteBaseUrl(request(), {
      NEXT_PUBLIC_SITE_URL: 'javascript:alert(1)',
      NODE_ENV: 'production',
    })).toBeNull()
  })
})
