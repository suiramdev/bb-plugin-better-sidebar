/**
 * Upper-cases the first character, vendored from `format-helpers.ts` in
 * `@bb/thread-view`.
 *
 * It exists here for one caller: the rename dialog builds its title and button
 * from a lowercase entity noun ("environment" becomes "Rename environment" and
 * the "Environment name" field label). Pulling the host's helper across is
 * cheaper than reaching into a package a plugin cannot import.
 */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
