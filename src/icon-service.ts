/**
 * The plugin's icon logic, independent of the bb API surface.
 *
 * Everything it touches is injected — kv, fetch, clock, the project list, the
 * realtime publisher — so the rules below can be tested without a server, and
 * `server.ts` stays a wiring file.
 */
import {
  DEFAULT_ICON_RECORD,
  dataUrlByteLength,
  ICON_BYTES_MAX,
  type IconMode,
  type IconRecord,
} from "./icon-record";
import { candidatesForRemoteUrl } from "./icon-sources";
import {
  clearIcon,
  needsAutoResolve,
  readIcon,
  writeIcon,
  type IconKv,
} from "./icon-store";
import { resolveIcon, type FetchLike } from "./resolve-icon";
import { fetchIconImage } from "./resolve-icon";
import type { PublicIcon } from "./contract";

export interface IconServiceProject {
  id: string;
  gitRemoteUrl: string | null;
}

export interface IconServiceDeps {
  kv: IconKv;
  fetchImpl: FetchLike;
  /** Aborted on reload/disable/shutdown; every fetch inherits it. */
  signal: AbortSignal;
  now?: () => number;
  listProjects: () => Promise<readonly IconServiceProject[]>;
  /** Called after a record changes, so open clients can refetch. */
  onChange: (projectId: string) => void;
  log: (message: string) => void;
}

export class IconService {
  #deps: IconServiceDeps;
  /** Projects with a resolution in flight, so a burst collapses into one. */
  #inFlight = new Map<string, Promise<IconRecord>>();

  constructor(deps: IconServiceDeps) {
    this.#deps = deps;
  }

  #now(): number {
    return (this.#deps.now ?? Date.now)();
  }

  toPublic(projectId: string, record: IconRecord): PublicIcon {
    return {
      mode: record.mode,
      dataUrl: record.dataUrl,
      origin: record.origin,
      sourceUrl: record.sourceUrl,
      error: record.error,
      fetchedAt: record.fetchedAt,
      isResolving: this.#inFlight.has(projectId),
    };
  }

  async read(projectId: string): Promise<IconRecord> {
    return readIcon(this.#deps.kv, projectId);
  }

  /**
   * Icons for the projects a client is showing. Records that are missing or
   * stale are resolved in the background — the caller gets today's answer
   * immediately and a realtime signal when a better one arrives.
   */
  async iconsFor(
    projectIds: readonly string[],
  ): Promise<Record<string, PublicIcon>> {
    const projects = new Map(
      (await this.#deps.listProjects()).map((project) => [project.id, project]),
    );
    const icons: Record<string, PublicIcon> = {};
    for (const projectId of new Set(projectIds)) {
      const record = await this.read(projectId);
      icons[projectId] = this.toPublic(projectId, record);
      const remoteUrl = projects.get(projectId)?.gitRemoteUrl ?? null;
      if (needsAutoResolve(record, { remoteUrl, now: this.#now() })) {
        this.#resolveInBackground(projectId, remoteUrl);
      }
    }
    return icons;
  }

  /** Resolves every project whose `auto` icon is missing, stale, or moved. */
  async sweep(): Promise<void> {
    const projects = await this.#deps.listProjects();
    for (const project of projects) {
      if (this.#deps.signal.aborted) return;
      const record = await this.read(project.id);
      if (
        needsAutoResolve(record, {
          remoteUrl: project.gitRemoteUrl,
          now: this.#now(),
        })
      ) {
        await this.#resolveAuto(project.id, project.gitRemoteUrl);
      }
    }
  }

  async setIcon(input: {
    projectId: string;
    mode: IconMode;
    url?: string;
    dataUrl?: string;
  }): Promise<PublicIcon> {
    const { projectId, mode } = input;
    if (mode === "auto") {
      // Dropping the record is the honest way to say "no override": the next
      // read starts from the default and resolves from the current remote.
      await clearIcon(this.#deps.kv, projectId);
      this.#deps.onChange(projectId);
      const remoteUrl = await this.#remoteUrlFor(projectId);
      return this.toPublic(projectId, await this.#resolveAuto(projectId, remoteUrl));
    }

    if (mode === "none") {
      return this.toPublic(
        projectId,
        await this.#write(projectId, {
          ...DEFAULT_ICON_RECORD,
          mode: "none",
          attemptedAt: this.#now(),
        }),
      );
    }

    if (mode === "url") {
      const url = input.url;
      if (url === undefined) throw new Error("A URL is required.");
      const fetched = await fetchIconImage(url, {
        fetchImpl: this.#deps.fetchImpl,
        signal: this.#deps.signal,
      });
      return this.toPublic(
        projectId,
        await this.#write(projectId, {
          ...DEFAULT_ICON_RECORD,
          mode: "url",
          sourceUrl: url,
          dataUrl: fetched.ok ? fetched.icon.dataUrl : null,
          origin: fetched.ok ? "url" : null,
          error: fetched.ok ? null : fetched.error,
          fetchedAt: fetched.ok ? this.#now() : null,
          attemptedAt: this.#now(),
        }),
      );
    }

    const dataUrl = input.dataUrl;
    if (dataUrl === undefined) throw new Error("An image is required.");
    if (dataUrlByteLength(dataUrl) > ICON_BYTES_MAX) {
      throw new Error(
        `The image is larger than ${ICON_BYTES_MAX / 1024}KB after encoding.`,
      );
    }
    return this.toPublic(
      projectId,
      await this.#write(projectId, {
        ...DEFAULT_ICON_RECORD,
        mode: "upload",
        dataUrl,
        origin: "upload",
        fetchedAt: this.#now(),
        attemptedAt: this.#now(),
      }),
    );
  }

  /**
   * Re-fetches now, whatever the mode and however fresh the record: the button
   * a user presses when a forge avatar changed, or when a lookup failed.
   */
  async refresh(projectId: string): Promise<PublicIcon> {
    const record = await this.read(projectId);
    if (record.mode === "none") return this.toPublic(projectId, record);
    if (record.mode === "upload") {
      // Uploaded bytes are the source of truth; there is nothing to re-fetch.
      return this.toPublic(projectId, record);
    }
    if (record.mode === "url" && record.sourceUrl !== null) {
      return this.setIcon({
        projectId,
        mode: "url",
        url: record.sourceUrl,
      });
    }
    return this.toPublic(
      projectId,
      await this.#resolveAuto(projectId, await this.#remoteUrlFor(projectId)),
    );
  }

  async #remoteUrlFor(projectId: string): Promise<string | null> {
    const projects = await this.#deps.listProjects();
    return projects.find((project) => project.id === projectId)?.gitRemoteUrl ?? null;
  }

  #resolveInBackground(projectId: string, remoteUrl: string | null): void {
    void this.#resolveAuto(projectId, remoteUrl).catch(() => {});
  }

  /**
   * Resolves one project's `auto` icon from its git remote. Never rejects: a
   * forge that is down leaves a reason on the record and the sidebar keeps its
   * fallback glyph.
   */
  async #resolveAuto(
    projectId: string,
    remoteUrl: string | null,
  ): Promise<IconRecord> {
    const existing = this.#inFlight.get(projectId);
    if (existing !== undefined) return existing;

    const work = (async (): Promise<IconRecord> => {
      const current = await this.read(projectId);
      if (current.mode !== "auto") return current;
      const result = await resolveIcon(candidatesForRemoteUrl(remoteUrl), {
        fetchImpl: this.#deps.fetchImpl,
        signal: this.#deps.signal,
      });
      const now = this.#now();
      if (!result.ok) {
        this.#deps.log(`icon lookup failed for ${projectId}: ${result.error}`);
        return this.#write(projectId, {
          ...current,
          mode: "auto",
          dataUrl: null,
          origin: null,
          error: result.error,
          fetchedAt: null,
          attemptedAt: now,
          remoteUrl,
        });
      }
      return this.#write(projectId, {
        ...current,
        mode: "auto",
        sourceUrl: null,
        dataUrl: result.icon.dataUrl,
        origin: result.icon.origin,
        error: null,
        fetchedAt: now,
        attemptedAt: now,
        remoteUrl,
      });
    })();

    this.#inFlight.set(projectId, work);
    try {
      return await work;
    } finally {
      this.#inFlight.delete(projectId);
      this.#deps.onChange(projectId);
    }
  }

  async #write(projectId: string, record: IconRecord): Promise<IconRecord> {
    await writeIcon(this.#deps.kv, projectId, record);
    this.#deps.onChange(projectId);
    return record;
  }
}
