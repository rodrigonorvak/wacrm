import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  migrateInboundMedia,
  parseLegacyInboundMediaUrl,
} from './migrate-inbound-media.mjs'

const ACCOUNT_ID = '11111111-2222-3333-4444-555555555555'
const OLD_PATH = `account-${ACCOUNT_ID}/inbound/1234567890123456-invoice.pdf`
const OLD_URL = `https://project.supabase.co/storage/v1/object/public/chat-media/${OLD_PATH}`
const PRIVATE_URL = `/api/whatsapp/inbound-media/${OLD_PATH}`

function makeAdmin({ rows, updateRows = [{ id: 'message-1' }] }) {
  const calls = { updates: [], downloads: [], uploads: [] }
  const admin = {
    from(table) {
      const state = { mode: 'select', filters: [], update: null, cursor: null, limit: rows.length }
      const query = {
        select() {
          if (state.mode === 'update') {
            return Promise.resolve({ data: updateRows, error: null })
          }
          return query
        },
        like() { return query },
        order() { return query },
        limit(value) { state.limit = value; return query },
        gt(_column, value) { state.cursor = value; return query },
        update(value) {
          state.mode = 'update'
          state.update = value
          calls.updates.push({ table, state })
          return query
        },
        eq(column, value) {
          state.filters.push([column, value])
          return query
        },
        then(resolve, reject) {
          const filtered = state.cursor ? rows.filter((row) => row.id > state.cursor) : rows
          const data = filtered.slice(0, state.limit)
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return query
    },
    storage: {
      from(bucket) {
        return {
          async download(path) {
            calls.downloads.push({ bucket, path })
            return { data: new Blob(['bytes'], { type: 'application/pdf' }), error: null }
          },
          async upload(path, file, options) {
            calls.uploads.push({ bucket, path, file, options })
            return { error: null }
          },
        }
      },
    },
  }
  return { admin, calls }
}

describe('parseLegacyInboundMediaUrl', () => {
  it('accepts only an inbound path on the configured Supabase host', () => {
    expect(parseLegacyInboundMediaUrl(OLD_URL, 'https://project.supabase.co')).toEqual({
      accountId: ACCOUNT_ID,
      objectPath: OLD_PATH,
      privateUrl: PRIVATE_URL,
    })
    expect(parseLegacyInboundMediaUrl(OLD_URL, 'https://other.supabase.co')).toBeNull()
  })

  it('rejects other buckets, non-inbound paths, malformed IDs and traversal', () => {
    expect(parseLegacyInboundMediaUrl(OLD_URL.replace('chat-media', 'flow-media'))).toBeNull()
    expect(parseLegacyInboundMediaUrl(OLD_URL.replace('/inbound/', '/outbound/'))).toBeNull()
    expect(parseLegacyInboundMediaUrl(OLD_URL.replace(ACCOUNT_ID, 'not-a-uuid'))).toBeNull()
    expect(parseLegacyInboundMediaUrl(OLD_URL.replace('invoice.pdf', '..%2fsecret.pdf'))).toBeNull()
  })
})

describe('migrateInboundMedia', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  })

  it('dry-runs valid rows without reading or writing Storage', async () => {
    const { admin, calls } = makeAdmin({
      rows: [{
        id: 'message-1',
        media_url: OLD_URL,
        conversation: { account_id: ACCOUNT_ID },
      }],
    })
    const result = await migrateInboundMedia({ admin, log: vi.fn() })

    expect(result).toMatchObject({
      scanned: 1,
      candidates: 1,
      migrated: 0,
      skipped: 0,
      failed: 0,
      apply: false,
      nextAfter: 'message-1',
    })
    expect(calls.downloads).toHaveLength(0)
    expect(calls.uploads).toHaveLength(0)
    expect(calls.updates).toHaveLength(0)
  })

  it('resumes after the last scanned message when processing multiple batches', async () => {
    const rows = [1, 2].map((number) => ({
      id: `message-${number}`,
      media_url: OLD_URL,
      conversation: { account_id: ACCOUNT_ID },
    }))
    const first = makeAdmin({ rows })
    const firstResult = await migrateInboundMedia({ admin: first.admin, limit: 1, log: vi.fn() })
    const second = makeAdmin({ rows })
    const secondResult = await migrateInboundMedia({
      admin: second.admin,
      limit: 1,
      after: firstResult.nextAfter,
      log: vi.fn(),
    })

    expect(firstResult.nextAfter).toBe('message-1')
    expect(secondResult.nextAfter).toBe('message-2')
    expect(secondResult.scanned).toBe(1)
  })

  it('skips a row when its conversation account differs from the object path', async () => {
    const { admin, calls } = makeAdmin({
      rows: [{
        id: 'message-1',
        media_url: OLD_URL,
        conversation: { account_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      }],
    })
    const result = await migrateInboundMedia({ admin, apply: true, log: vi.fn() })

    expect(result).toMatchObject({ candidates: 0, skipped: 1, migrated: 0 })
    expect(calls.downloads).toHaveLength(0)
    expect(calls.uploads).toHaveLength(0)
    expect(calls.updates).toHaveLength(0)
  })

  it('copies privately and conditionally replaces only the matching old URL', async () => {
    const { admin, calls } = makeAdmin({
      rows: [{
        id: 'message-1',
        media_url: OLD_URL,
        conversation: { account_id: ACCOUNT_ID },
      }],
    })
    const result = await migrateInboundMedia({ admin, apply: true, log: vi.fn() })

    expect(result).toMatchObject({ candidates: 1, migrated: 1, skipped: 0, failed: 0, apply: true })
    expect(calls.downloads).toEqual([{ bucket: 'chat-media', path: OLD_PATH }])
    expect(calls.uploads[0]).toMatchObject({
      bucket: 'chat-inbound',
      path: OLD_PATH,
      options: { upsert: true, contentType: 'application/pdf' },
    })
    expect(calls.updates[0].state.update).toEqual({ media_url: PRIVATE_URL })
    expect(calls.updates[0].state.filters).toEqual([
      ['id', 'message-1'],
      ['media_url', OLD_URL],
    ])
  })
})