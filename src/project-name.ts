/**
 * The name a picked folder gives a new project: its last path segment, the
 * same thing BB's own Add-project flow shows. Handles both separators and a
 * trailing slash, and falls back to the raw path when there is no segment
 * (a bare root), because an empty project name is refused upstream.
 */
export function projectNameFromPath(path: string): string {
  const segments = path.split(/[/\\]/).filter((segment) => segment !== "");
  return segments[segments.length - 1] ?? path.trim();
}
