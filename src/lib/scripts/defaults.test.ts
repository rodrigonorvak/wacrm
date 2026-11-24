import { describe, expect, it } from 'vitest'
import { applyScriptName, DEFAULT_CONVERSATION_SCRIPTS, firstNameFromContact } from './defaults'

describe('conversation scripts', () => {
  it('keeps the three default scripts ready for admin HTML', () => {
    expect(DEFAULT_CONVERSATION_SCRIPTS.map((script) => script.title)).toEqual([
      'Lead de Clareamento',
      'Lead de Prótese',
      'Lead Aparelho',
    ])
    for (const script of DEFAULT_CONVERSATION_SCRIPTS) {
      expect(script.html_content).toContain('data-script-msg=')
    }
  })

  it('fills the first name into script lines', () => {
    expect(firstNameFromContact('André Mafra')).toBe('André')
    expect(applyScriptName('Prazer, “Nome”!', 'André Mafra')).toBe('Prazer, André!')
    expect(applyScriptName('Oi "Nome"', 'Maria Silva')).toBe('Oi Maria')
  })
})
