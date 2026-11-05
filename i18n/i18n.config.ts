// French plural rule: below 2 is singular ("0,5 jour", "1 jour", "1,5 jour").
// Three-form messages keep their "zero | one | many" meaning.
function frenchPlural(choice: number, choicesLength: number): number {
  const n = Math.abs(choice)
  if (choicesLength === 3) return n === 0 ? 0 : n === 1 ? 1 : 2
  return n < 2 ? 0 : 1
}

export default defineI18nConfig(() => ({
  pluralRules: { fr: frenchPlural },
}))
