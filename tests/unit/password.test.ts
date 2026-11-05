import { describe, it, expect } from 'vitest'
import { isPasswordValid, passwordStrength, strengthLevel } from '~/utils/password'

describe('isPasswordValid', () => {
  it('requires 12 characters and a digit', () => {
    expect(isPasswordValid('short1')).toBe(false)
    expect(isPasswordValid('abcdefghijkl')).toBe(false)
    expect(isPasswordValid('abcdefghijk1')).toBe(true)
  })
})

describe('passwordStrength', () => {
  it('scores 0 for an empty password', () => {
    expect(passwordStrength('')).toBe(0)
  })
  it('adds a point per criterion', () => {
    expect(passwordStrength('abcdefghijkl')).toBe(1)
    expect(passwordStrength('abcdefghijk1')).toBe(2)
    expect(passwordStrength('Abcdefghijk1')).toBe(3)
    expect(passwordStrength('Abcdefghijk1!')).toBe(4)
  })
  it('counts a long password like a symbol', () => {
    expect(passwordStrength('Abcdefghijklmno1')).toBe(4)
  })
})

describe('strengthLevel', () => {
  it('maps scores to levels', () => {
    expect(strengthLevel(1)).toBe('weak')
    expect(strengthLevel(3)).toBe('medium')
    expect(strengthLevel(4)).toBe('strong')
  })
})
