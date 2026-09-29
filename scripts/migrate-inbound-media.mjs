import { createClient } from '@supabase/supabase-js'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_LIMIT = 50
const LEGACY_URL_PATTERN = '%/storage/v1/object/public/chat-media/account-%/inbound/%'
const INTERNAL_URL_PREFIX = '/api/whatsapp/inbound-media/'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FILE_PATTERN = /^[a-zA-Z0-9._-]{1,120}$/

export function parseLegacyInboundMediaUrl(value, supabaseUrl) {
  if (typeof value !== 'string') return null

  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (supabaseUrl && url.origin !== new URL(supabaseUrl).origin) return null

  const marker = '/storage/v1/object/public/chat-media/'
  const markerIndex = url.pathname.indexOf(marker)
  if (markerIndex < 0) return null

  let objectPath
  try {
    objectPath = url.pathname
      .slice(markerIndex + marker.length)
      .split('/')
      .map((segment) => decodeURIComponent(segment))
  } catch {
    return null
  }

  if (objectPath.length !== 3 || objectPath[1] !== 'inbound') return null
  const accountMatch = objectPath[0].match(/^account-(.+)$/)
  if (!accountMatch || !UUID_PATTERN.test(accountMatch[1])) return null
  if (!FILE_PATTERN.test(objectPath[2]) || objectPath[2] === '.' || objectPath[2] === '..') {
    return null
  }

  return {
    accountId: accountMatch[1],
    objectPath: objectPath.join('/'),
    privateUrl: `${INTERNAL_URL_PREFIX}${objectPath.map(encodeURIComponent).join('/')}`,
  }
}

function parseLimit(args) {
  const option = args.find((arg) => arg.startsWith('--limit='))
  if (!option) return DEFAULT_LIMIT
  const value = Number(option.slice('--limit='.length))
  if (!Number.isInteger(value) || value < 1 || value > 500) {
    throw new Error('--limit must be an integer between 1 and 500')
  }
  return value
}

function parseAfter(args) {
  const option = args.find((arg) => arg.startsWith('--after='))
  if (!option) return null
  const value = option.slice('--after='.length)
  if (!UUID_PATTERN.test(value)) {
    throw new Error('--after must be a message UUID from a previous run')
  }
  return value
}

function getConversationAccount(value) {
  const conversation = Array.isArray(value) ? value[0] : value
  return conversation?.account_id ?? null
}

export async function migrateInboundMedia({ admin, apply = false, limit = DEFAULT_LIMIT, after = null, log = console.log }) {
  let cursor = after
  let scanned = 0
  let candidates = 0
  let migrated = 0
  let skipped = 0
  let failed = 0

  while (scanned < limit) {
    let query = admin
      .from('messages')
      .select('id, media_url, conversation:conversations!inner(account_id)')
      .like('media_url', LEGACY_URL_PATTERN)
      .order('id', { ascending: true })
      .limit(Math.min(50, limit - scanned))

    if (cursor) query = query.gt('id', cursor)

    const { data: rows, error } = await query
    if (error) throw new Error(`Could not list legacy media messages: ${error.message}`)
    if (!rows?.length) break

    for (const row of rows) {
      cursor = row.id
      scanned += 1

      const source = parseLegacyInboundMediaUrl(row.media_url, process.env.NEXT_PUBLIC_SUPABASE_URL)
      if (!source || source.accountId !== getConversationAccount(row.conversation)) {
        skipped += 1
        log(`SKIP message ${row.id}: invalid path or account mismatch`)
        continue
      }
      candidates += 1

      if (!apply) {
        log(`DRY-RUN message ${row.id}: eligible`)
        continue
      }

      const { data: file, error: downloadError } = await admin.storage
        .from('chat-media')
        .download(source.objectPath)
      if (downloadError || !file) {
        failed += 1
        log(`FAIL message ${row.id}: source download failed`)
        continue
      }

      const { error: uploadError } = await admin.storage
        .from('chat-inbound')
        .upload(source.objectPath, file, {
          cacheControl: '0',
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        })
      if (uploadError) {
        failed += 1
        log(`FAIL message ${row.id}: private upload failed`)
        continue
      }

      const { data: updated, error: updateError } = await admin
        .from('messages')
        .update({ media_url: source.privateUrl })
        .eq('id', row.id)
        .eq('media_url', row.media_url)
        .select('id')

      if (updateError || !updated?.length) {
        failed += 1
        log(`FAIL message ${row.id}: message URL was not updated; source file was preserved`)
        continue
      }

      migrated += 1
      log(`MIGRATED message ${row.id}`)
    }
  }

  return { scanned, candidates, migrated, skipped, failed, apply, nextAfter: cursor }
}

async function main() {
  const args = process.argv.slice(2)
  const unknown = args.filter((arg) => arg !== '--apply' && !arg.startsWith('--limit=') && !arg.startsWith('--after='))
  if (unknown.length) throw new Error(`Unknown option: ${unknown[0]}`)

  const apply = args.includes('--apply')
  const limit = parseLimit(args)
  const after = parseAfter(args)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the shell environment')
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const result = await migrateInboundMedia({ admin, apply, limit, after })
  console.log(JSON.stringify(result, null, 2))
  if (result.failed > 0) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
