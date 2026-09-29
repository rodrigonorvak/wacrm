import { describe, expect, it } from 'vitest'
import { parseAvatarObjectPath, privateAvatarUrl } from './avatar-url'

const USER_ID = '11111111-2222-3333-4444-555555555555'
const BASE_URL = 'https://project.supabase.co'
const STORAGE_URL = `${BASE_URL}/storage/v1/object/public/avatars/${USER_ID}/avatar-123.png`

 describe('avatar URL scoping', () => {
  it('converts a same-project avatar owned by the expected user', () => {
    expect(parseAvatarObjectPath(STORAGE_URL, USER_ID, BASE_URL)).toEqual({
      userId: USER_ID,
      fileName: 'avatar-123.png',
      path: `${USER_ID}/avatar-123.png`,
    })
    expect(privateAvatarUrl(STORAGE_URL, USER_ID, BASE_URL)).toBe(
      `/api/account/avatars/${USER_ID}/avatar-123.png`,
    )
  })

  it('preserves external avatar providers without proxying them', () => {
    const gravatar = 'https://www.gravatar.com/avatar/abc?d=mp&s=256'
    expect(privateAvatarUrl(gravatar, USER_ID, BASE_URL)).toBe(gravatar)
  })

  it('rejects another project, another user folder and unsafe filenames', () => {
    expect(parseAvatarObjectPath(STORAGE_URL, USER_ID, 'https://other.supabase.co')).toBeNull()
    expect(parseAvatarObjectPath(STORAGE_URL, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', BASE_URL)).toBeNull()
    expect(parseAvatarObjectPath(STORAGE_URL.replace('avatar-123.png', '..%2fsecret.png'), USER_ID, BASE_URL)).toBeNull()
    expect(parseAvatarObjectPath(STORAGE_URL.replace('avatar-123.png', 'document.pdf'), USER_ID, BASE_URL)).toBeNull()
  })
})
