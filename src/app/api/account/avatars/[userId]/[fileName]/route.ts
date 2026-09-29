import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { parseAvatarObjectPath } from '@/lib/storage/avatar-url'

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FILE_NAME_PATTERN = /^avatar-[0-9]+\.(?:png|jpe?g|webp|gif)$/i

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string; fileName: string }> },
) {
  let ctx
  try {
    ctx = await getCurrentAccount()
  } catch (error) {
    return toErrorResponse(error)
  }

  const { userId, fileName } = await params
  if (!USER_ID_PATTERN.test(userId) || !FILE_NAME_PATTERN.test(fileName)) {
    return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })
  }

  const { data: profile, error: profileError } = await ctx.supabase
    .from('profiles')
    .select('avatar_url')
    .eq('user_id', userId)
    .eq('account_id', ctx.accountId)
    .maybeSingle()

  if (profileError || !profile?.avatar_url) {
    return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })
  }

  const avatar = parseAvatarObjectPath(profile.avatar_url, userId)
  if (!avatar || avatar.fileName !== fileName) {
    return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })
  }

  const { data, error } = await supabaseAdmin()
    .storage
    .from('avatars')
    .createSignedUrl(avatar.path, 60)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })
  }

  const response = NextResponse.redirect(data.signedUrl, 307)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
