/**
 * Read-only layered store that merges a primary store with a remote store.
 *
 * Used in discovery mode with remote indexes:
 * - Primary store: FilesystemStore (local indexes)
 * - Remote store: CompositeStoreReader (remote indexes)
 *
 * Behavior:
 * - list(): Merge both lists, deduplicated, sorted
 * - loadState(name): Try primary first, then remote
 * - loadSearch(name): Try primary first, then remote
 * - No save/delete methods (read-only)
 *
 * @module stores/read-only-layered-store
 */

import type { IndexStoreReader } from "./types.js";
import type { IndexState, IndexStateSearchOnly } from "../core/types.js";

/**
 * Read-only layered store that combines a primary and remote store.
 *
 * Useful for discovery mode where users can:
 * - Manage local indexes via CLI (stored in FilesystemStore)
 * - Reference remote indexes via -i flags (stored in CompositeStoreReader)
 *
 * @example
 * ```typescript
 * const primary = new FilesystemStore();
 * const remote = await CompositeStoreReader.fromSpecs([
 *   { type: "s3", value: "s3://bucket/shared-index", displayName: "shared" }
 * ]);
 * const layered = new ReadOnlyLayeredStore(primary, remote);
 *
 * // Lists both local and remote indexes
 * const allIndexes = await layered.list();
 *
 * // Tries primary first, then remote
 * const state = await layered.loadSearch("my-index");
 * ```
 */
export class ReadOnlyLayeredStore implements IndexStoreReader {
  constructor(
    private primary: IndexStoreReader,
    private remote: IndexStoreReader
  ) {}

  async loadState(key: string): Promise<IndexState | null> {
    // Try primary first
    const primaryState = await this.primary.loadState(key);
    if (primaryState !== null) {
      return primaryState;
    }
    // Fall back to remote
    return this.remote.loadState(key);
  }

  async loadSearch(key: string): Promise<IndexStateSearchOnly | null> {
    // Try primary first
    const primarySearch = await this.primary.loadSearch(key);
    if (primarySearch !== null) {
      return primarySearch;
    }
    // Fall back to remote
    return this.remote.loadSearch(key);
  }

  async list(): Promise<string[]> {
    // Get both lists
    const [primaryList, remoteList] = await Promise.all([
      this.primary.list(),
      this.remote.list(),
    ]);

    // Merge and deduplicate
    const merged = new Set([...primaryList, ...remoteList]);

    // Return sorted array
    return Array.from(merged).sort();
  }
}

