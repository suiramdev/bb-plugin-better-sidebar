/** "2nd", "3rd" — for a screen-reader label, where "2" alone says nothing. */
const ORDINAL_SUFFIXES: Record<Intl.LDMLPluralRule, string> = {
  one: "st",
  two: "nd",
  few: "rd",
  other: "th",
  zero: "th",
  many: "th",
};

const ORDINAL_RULES = new Intl.PluralRules("en", { type: "ordinal" });

export function ordinal(position: number): string {
  return `${position}${ORDINAL_SUFFIXES[ORDINAL_RULES.select(position)]}`;
}
