/**
 * Parsing a project's `gitRemoteUrl` into the pieces an icon lookup needs.
 *
 * Pure and dependency-free so it can be unit-tested without a bb server: the
 * only interesting part of icon resolution is deciding *where* to look, and
 * that decision is made entirely from the remote URL.
 */

export interface GitRemote {
  /** Lowercased host, e.g. "github.com". No port, no credentials. */
  host: string;
  /**
   * Everything before the repository name. A single user or org on GitHub
   * ("get-bb"); possibly nested groups on GitLab ("group/subgroup").
   */
  owner: string;
  /** Repository name with any ".git" suffix removed. */
  repo: string;
}

/** The first path segment of `owner` — the account an avatar belongs to. */
export function remoteAccount(remote: GitRemote): string {
  const [account] = remote.owner.split("/");
  return account ?? remote.owner;
}

/** "owner/repo", or "group/subgroup/repo" for a nested GitLab project. */
export function remoteProjectPath(remote: GitRemote): string {
  return `${remote.owner}/${remote.repo}`;
}

function stripGitSuffix(segment: string): string {
  return segment.endsWith(".git") ? segment.slice(0, -".git".length) : segment;
}

function fromHostAndPath(rawHost: string, rawPath: string): GitRemote | null {
  const host = rawHost.toLowerCase().replace(/^www\./, "");
  if (host === "") return null;
  const segments = rawPath
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");
  if (segments.length < 2) return null;
  const repo = stripGitSuffix(segments[segments.length - 1]!);
  const owner = segments.slice(0, -1).join("/");
  if (repo === "" || owner === "") return null;
  return { host, owner, repo };
}

/**
 * Accepts the forms bb records for a project remote: scp-style SSH
 * ("git@host:owner/repo.git"), ssh:// URLs, https:// URLs, and git://.
 * Returns null for anything else — a local path, a malformed value, or a
 * remote with no owner segment.
 */
export function parseGitRemote(remoteUrl: string | null): GitRemote | null {
  if (remoteUrl === null) return null;
  const trimmed = remoteUrl.trim();
  if (trimmed === "") return null;

  // scp-style: [user@]host:path. Distinguished from a URL by having no "//"
  // and from a Windows drive path by requiring a dot in the host.
  const scp = /^(?:[^@/]+@)?([^/:]+\.[^/:]+):(.+)$/.exec(trimmed);
  if (scp && !trimmed.includes("://")) {
    return fromHostAndPath(scp[1]!, scp[2]!);
  }

  try {
    const url = new URL(trimmed);
    if (!/^(https?|ssh|git):$/.test(url.protocol)) return null;
    return fromHostAndPath(url.hostname, url.pathname);
  } catch {
    return null;
  }
}
