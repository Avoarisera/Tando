/** Minimum rule shown to the user: 12 characters, including a number. */
export function isPasswordValid(password: string): boolean {
  return password.length >= 12 && /\d/.test(password)
}

/**
 * Strength score from 0 to 4 for the gauge: length ≥ 12, a digit,
 * upper and lower case, then a symbol or length ≥ 16.
 */
export function passwordStrength(password: string): number {
  if (!password) return 0
  let score = 0
  if (password.length >= 12) score++
  if (/\d/.test(password)) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password) || password.length >= 16) score++
  return score
}

export type StrengthLevel = 'weak' | 'medium' | 'strong'

export function strengthLevel(score: number): StrengthLevel {
  if (score <= 1) return 'weak'
  if (score <= 3) return 'medium'
  return 'strong'
}
