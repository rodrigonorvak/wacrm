import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getActivePlatformApp } from '@/lib/whatsapp/platform-app'

/** Public Embedded Signup settings (no secrets) for the connect button. */
export async function GET() {
  try {
    await requireRole('admin')
    const app = await getActivePlatformApp()
    if (!app || !app.config_id || !app.app_secret_encrypted) {
      return NextResponse.json({ available: false })
    }
    return NextResponse.json({
      available: true,
      appId: app.app_id,
      configId: app.config_id,
      apiVersion: app.api_version || 'v21.0',
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
