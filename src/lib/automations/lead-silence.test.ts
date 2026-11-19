import { describe, expect, it } from 'vitest'
import {
  isNewLeadStage,
  isStoppedReplyStage,
  silenceCutoffIso,
} from './lead-silence'

describe('lead silence stages', () => {
  it('recognizes the new-lead column in the supported names', () => {
    expect(isNewLeadStage('Novo lead')).toBe(true)
    expect(isNewLeadStage('Novo Lead')).toBe(true)
    expect(isNewLeadStage('New Lead')).toBe(true)
    expect(isNewLeadStage('Qualificado')).toBe(false)
  })

  it('recognizes the stopped-reply column', () => {
    expect(isStoppedReplyStage('Parou de responder')).toBe(true)
    expect(isStoppedReplyStage('Não respondeu')).toBe(true)
    expect(isStoppedReplyStage('Stopped replying')).toBe(true)
    expect(isStoppedReplyStage('Novo lead')).toBe(false)
  })

  it('counts the wait back from now without changing the clock unit', () => {
    const now = new Date('2026-11-19T15:00:00.000Z')
    expect(silenceCutoffIso(now, 120)).toBe('2026-11-19T13:00:00.000Z')
  })
})
