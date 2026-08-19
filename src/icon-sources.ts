/**
 * Where to look for a project's icon when the user has not chosen one.
 *
 * The order is "most specific first": an account avatar says more about a
 * project than the git host's own favicon, so the host favicon is only the
 * last resort. Candidates are data, not fetches — `resolveIcon` walks them.
 */
import {
  parseGitRemote,
  remoteAccount,
  remoteProjectPath,
  type GitRemote,
} from "./git-remote";

export type IconCandidate =
  | { kind: "image"; url: string; origin: "github-avatar" | "host-favicon" }
  /**
   * GitLab's avatar is behind its API: one JSON request for the project, whose
   * `avatar_url` may be null (most projects have none) or may point at a group
   * avatar. Modelled as its own kind so the fetch layer stays generic.
   */
  | { kind: "gitlab-project"; apiUrl: string; origin: "gitlab-avatar" };

const GITHUB_HOSTS = new Set(["github.com"]);

export function iconCandidates(remote: GitRemote): IconCandidate[] {
  const candidates: IconCandidate[] = [];

  if (GITHUB_HOSTS.has(remote.host)) {
    // The account avatar endpoint covers users and organizations alike, needs
    // no token, and 302s to the CDN with a real content type.
    candidates.push({
      kind: "image",
      url: `https://github.com/${encodeURIComponent(remoteAccount(remote))}.png?size=128`,
      origin: "github-avatar",
    });
  } else {
    // Tried on every non-GitHub host, not just gitlab.com: a self-hosted GitLab
    // is the common case in a company, and its per-project avatar beats the
    // instance favicon. A host that is not GitLab answers 404 and costs one
    // request before the favicon fallback.
    candidates.push({
      kind: "gitlab-project",
      apiUrl: `https://${remote.host}/api/v4/projects/${encodeURIComponent(remoteProjectPath(remote))}`,
      origin: "gitlab-avatar",
    });
  }

  // Gitea, Bitbucket, or anything else: the host's own favicon at least tells
  // the user which forge a project lives on.
  candidates.push({
    kind: "image",
    url: `https://${remote.host}/favicon.ico`,
    origin: "host-favicon",
  });

  return candidates;
}

export function candidatesForRemoteUrl(remoteUrl: string | null): IconCandidate[] {
  const remote = parseGitRemote(remoteUrl);
  return remote === null ? [] : iconCandidates(remote);
}
