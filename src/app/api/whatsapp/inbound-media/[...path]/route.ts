import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'

const OBJECT_SEGMENT = /^[a-zA-Z0-9._-]{1,120}$/

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  let account
  try {
    account = await getCurrentAccount()
  } catch (error) {
    return toErrorResponse(error)
  }

  const { path } = await params
  if (
    path.length !== 3 ||
    path[0] !== `account-${account.accountId}` ||
    path[1] !== 'inbound' ||
    !OBJECT_SEGMENT.test(path[2]) ||
    path[2] === '.' ||
    path[2] === '..'
  ) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }

  const { data, error } = await supabaseAdmin()
    .storage
    .from('chat-inbound')
    .createSignedUrl(path.join('/'), 60)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }

  const response = NextResponse.redirect(data.signedUrl, 307)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
