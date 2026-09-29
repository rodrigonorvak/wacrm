import { isAccountRole, type AccountRole } from './roles'

export type NewMemberRole = Exclude<AccountRole, 'owner'>

export interface NewMemberInput {
  email: string
  password: string
  fullName: string
  role: NewMemberRole
}

export type NewMemberInputResult =
  | { ok: true; value: NewMemberInput }
  | { ok: false; error: string }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseNewMemberInput(value: unknown): NewMemberInputResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Request body must be an object' }
  }

  const input = value as Record<string, unknown>
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { ok: false, error: 'A valid email is required' }
  }

  const password = typeof input.password === 'string' ? input.password : ''
  if (password.length < 12 || password.length > 128) {
    return { ok: false, error: 'Temporary password must be between 12 and 128 characters' }
  }

  const fullName = typeof input.full_name === 'string' ? input.full_name.trim() : ''
  if (fullName.length > 120) {
    return { ok: false, error: 'Name must be 120 characters or fewer' }
  }

  const role = input.role
  if (!isAccountRole(role) || role === 'owner') {
    return { ok: false, error: 'Role must be admin, agent, or viewer' }
  }

  return { ok: true, value: { email, password, fullName, role } }
}
