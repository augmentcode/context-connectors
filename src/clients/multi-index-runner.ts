/**
 * MultiIndexRunner - Shared tool execution logic for multi-index scenarios.
 *
 * Used by both MCP server and CLI agent to provide search/listFiles/readFile
 * across multiple indexes with lazy client initialization.
 *
 * @module clients/multi-index-runner
 */

import type { IndexStoreReader, IndexStore } from "../stores/types.js";
import type { Source } from "../sources/types.js";
import type { IndexStateSearchOnly } from "../core/types.js";
import { getSourceIdentifier, getResolvedRef } from "../core/types.js";
import { SearchClient } from "./search-client.js";
import { formatListOutput } from "../tools/list-files.js";

/** Metadata about an available index */
export interface IndexInfo {
  name: string;
  type: string;
  identifier: string;
  ref?: string;
  syncedAt: string;
}

/** Configuration for MultiIndexRunner */
export interface MultiIndexRunnerConfig {
  /** Store to load indexes from */
  store: IndexStoreReader | IndexStore;
  /**
   * Index names to expose. If undefined, all indexes in the store are exposed.
   */
  indexNames?: string[];
  /**
   * Disable file operations (listFiles, readFile).
   * When true, only search is available.
   */
  searchOnly?: boolean;
  /**
   * Custom User-Agent string for analytics tracking.
   * When provided, this is passed to SearchClient instances for API requests.
   */
  clientUserAgent?: string;
}

/**
 * Create a Source from index state metadata.
 *
 * For VCS sources (GitHub, GitLab, BitBucket), uses `resolvedRef` (the indexed commit SHA)
 * if available, falling back to `config.ref` (branch name) if not.
 *
 * **Why resolvedRef matters:**
 * - `resolvedRef` is the exact commit SHA that was indexed for search
 * - Using it ensures `listFiles` and `readFile` return content from the same commit
 *   that was indexed, so file operations match search results
 * - If we used `config.ref` (branch name), the branch might have moved since indexing,
 *   causing file operations to return different content than what search indexed
 *
 * @internal Exported for testing
 */
export async function createSourceFromState(state: IndexStateSearchOnly): Promise<Source> {
  const meta = state.source;

  // For VCS sources, use resolvedRef (indexed commit SHA) if available.
  // This ensures file operations (listFiles, readFile) return content from
  // the same commit that was indexed, so results match search.
  // Falls back to config.ref for backwards compatibility with older indexes.

  if (meta.type === "github") {
    const { GitHubSource } = await import("../sources/github.js");
    return new GitHubSource({ ...meta.config, ref: meta.resolvedRef ?? meta.config.ref });
  } else if (meta.type === "gitlab") {
    const { GitLabSource } = await import("../sources/gitlab.js");
    return new GitLabSource({ ...meta.config, ref: meta.resolvedRef ?? meta.config.ref });
  } else if (meta.type === "bitbucket") {
    const { BitBucketSource } = await import("../sources/bitbucket.js");
    return new BitBucketSource({ ...meta.config, ref: meta.resolvedRef ?? meta.config.ref });
  } else if (meta.type === "website") {
    const { WebsiteSource } = await import("../sources/website.js");
    return new WebsiteSource(meta.config);
  }
  throw new Error(`Unknown source type: ${(meta as { type: string }).type}`);
}

/**
 * Manages multiple indexes and provides unified tool execution.
 *
 * Lazily initializes SearchClient instances as needed and caches them.
 */
export class MultiIndexRunner {
  private readonly store: IndexStoreReader | IndexStore;
  private readonly searchOnly: boolean;
  private clientUserAgent?: string;
  private readonly clientCache = new Map<string, SearchClient>();
  private readonly originalIndexNames: string[] | undefined;

  /** Available index names */
  indexNames: string[];

  /** Metadata about available indexes */
  indexes: IndexInfo[];

  private constructor(
    store: IndexStoreReader | IndexStore,
    indexNames: string[],
    indexes: IndexInfo[],
    searchOnly: boolean,
    clientUserAgent?: string,
    originalIndexNames?: string[]
  ) {
    this.store = store;
    this.indexNames = indexNames;
    this.indexes = indexes;
    this.searchOnly = searchOnly;
    this.clientUserAgent = clientUserAgent;
    this.originalIndexNames = originalIndexNames;
  }

  /**
   * Create a MultiIndexRunner from configuration.
   */
  static async create(config: MultiIndexRunnerConfig): Promise<MultiIndexRunner> {
    const store = config.store;
    const searchOnly = config.searchOnly ?? false;

    // Discover available indexes
    const allIndexNames = await store.list();
    const indexNames = config.indexNames ?? allIndexNames;

    // In fixed mode, save the original allowlist for later filtering
    const originalIndexNames = config.indexNames ? [...config.indexNames] : undefined;

    // Validate requested indexes exist
    const missingIndexes = indexNames.filter((n) => !allIndexNames.includes(n));
    if (missingIndexes.length > 0) {
      throw new Error(`Indexes not found: ${missingIndexes.join(", ")}`);
    }

    // Load metadata for available indexes, filtering out any that fail to load
    const indexes: IndexInfo[] = [];
    const validIndexNames: string[] = [];
    for (const name of indexNames) {
      try {
        const state = await store.loadSearch(name);
        if (state) {
          validIndexNames.push(name);
          indexes.push({
            name,
            type: state.source.type,
            identifier: getSourceIdentifier(state.source),
            ref: getResolvedRef(state.source),
            syncedAt: state.source.syncedAt,
          });
        }
        // Skip indexes that return null (not found)
      } catch {
        // Skip indexes that fail to load (e.g., corrupted or partial state)
      }
    }

    // Allow empty - server can start with no indexes and user can add via CLI
    return new MultiIndexRunner(store, validIndexNames, indexes, searchOnly, config.clientUserAgent, originalIndexNames);
  }

  /**
   * Update the User-Agent string.
   *
   * Call this after receiving MCP client info to include the client name/version.
   * Note: Only affects future client creations, not existing cached clients.
   */
  updateClientUserAgent(newUserAgent: string): void {
    this.clientUserAgent = newUserAgent;
  }

  /**
   * Get or create a SearchClient for an index.
   */
  async getClient(indexName: string): Promise<SearchClient> {
    if (!this.indexNames.includes(indexName)) {
      throw new Error(
        `Invalid index_name "${indexName}". Available: ${this.indexNames.join(", ")}`
      );
    }

    let client = this.clientCache.get(indexName);
    if (!client) {
      const state = await this.store.loadSearch(indexName);
      if (!state) {
        throw new Error(`Index "${indexName}" not found`);
      }
      const source = this.searchOnly
        ? undefined
        : await createSourceFromState(state);
      client = new SearchClient({
        store: this.store,
        source,
        indexName,
        clientUserAgent: this.clientUserAgent,
      });
      await client.initialize();
      this.clientCache.set(indexName, client);
    }
    return client;
  }

  /**
   * Refresh the list of available indexes from the store.
   * Call after adding or removing indexes.
   *
   * In fixed mode (when originalIndexNames is set), only includes indexes
   * from the original allowlist, even if other indexes exist in the store.
   */
  async refreshIndexList(): Promise<void> {
    const allIndexNames = await this.store.list();

    // In fixed mode, filter to only the original allowlist
    const indexNamesToLoad = this.originalIndexNames
      ? allIndexNames.filter(name => this.originalIndexNames!.includes(name))
      : allIndexNames;

    const newIndexes: IndexInfo[] = [];
    const newIndexNames: string[] = [];

    for (const name of indexNamesToLoad) {
      try {
        const state = await this.store.loadSearch(name);
        if (state) {
          newIndexNames.push(name);
          newIndexes.push({
            name,
            type: state.source.type,
            identifier: getSourceIdentifier(state.source),
            ref: getResolvedRef(state.source),
            syncedAt: state.source.syncedAt,
          });
        }
      } catch {
        // Skip indexes that fail to load
      }
    }

    this.indexNames = newIndexNames;
    this.indexes = newIndexes;
  }

  /**
   * Invalidate cached SearchClient for an index.
   * Call after updating an index to ensure fresh data on next access.
   */
  invalidateClient(indexName: string): void {
    this.clientCache.delete(indexName);
  }

  /** Check if file operations are enabled */
  hasFileOperations(): boolean {
    return !this.searchOnly;
  }

  /** Get formatted index list for tool descriptions */
  getIndexListString(): string {
    return this.indexes
      .map((i) => `- ${i.name} (${i.type}://${i.identifier})`)
      .join("\n");
  }
}

