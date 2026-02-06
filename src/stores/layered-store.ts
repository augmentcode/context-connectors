/**
 * Layered Store - Combines writable local storage with read-only remote indexes.
 *
 * Provides a unified interface that:
 * - Reads from local storage first, then falls back to remote
 * - Writes only to local storage
 * - Lists indexes from both sources (deduplicated)
 * - Prevents deletion of remote-only indexes
 *
 * @module stores/layered-store
 *
 * @example
 * ```typescript
 * import { LayeredStore, FilesystemStore, CompositeStoreReader } from "@augmentcode/context-connectors/stores";
 *
 * const localStore = new FilesystemStore();
 * const remoteStore = await CompositeStoreReader.fromSpecs(specs);
 * const layered = new LayeredStore(localStore, remoteStore);
 *
 * // Read from local first, then remote
 * const state = await layered.loadState("my-index");
 *
 * // Write only to local
 * await layered.save("my-index", fullState, searchState);
 *
 * // List all available indexes
 * const keys = await layered.list();
 * ```
 */

import type { IndexStore, IndexStoreReader } from "./types.js";
import type { IndexState, IndexStateSearchOnly } from "../core/types.js";
import type { FilesystemStore } from "./filesystem.js";
import type { CompositeStoreReader } from "./composite.js";

/**
 * Layered store that combines a writable local store with a read-only remote store.
 *
 * Implements the IndexStore interface by delegating:
 * - Read operations to local first, then remote
 * - Write operations to local only
 * - List operations to both (deduplicated)
 */
export class LayeredStore implements IndexStore {
  private readonly localStore: FilesystemStore;
  private readonly remoteStore: CompositeStoreReader;

  /**
   * Create a new LayeredStore.
   *
   * @param localStore - Writable local filesystem store
   * @param remoteStore - Read-only remote composite store
   */
  constructor(localStore: FilesystemStore, remoteStore: CompositeStoreReader) {
    this.localStore = localStore;
    this.remoteStore = remoteStore;
  }

  async loadState(key: string): Promise<IndexState | null> {
    // Try local first
    const localState = await this.localStore.loadState(key);
    if (localState !== null) {
      return localState;
    }

    // Fall back to remote
    return this.remoteStore.loadState(key);
  }

  async loadSearch(key: string): Promise<IndexStateSearchOnly | null> {
    // Try local first
    const localSearch = await this.localStore.loadSearch(key);
    if (localSearch !== null) {
      return localSearch;
    }

    // Fall back to remote
    return this.remoteStore.loadSearch(key);
  }

  async save(
    key: string,
    fullState: IndexState,
    searchState: IndexStateSearchOnly
  ): Promise<void> {
    // Always save to local store only
    await this.localStore.save(key, fullState, searchState);
  }

  async delete(key: string): Promise<void> {
    // Get lists from both stores
    const localList = await this.localStore.list();
    const remoteList = await this.remoteStore.list();

    // Check if the key exists in local
    const existsInLocal = localList.includes(key);

    // Check if the key exists in remote
    const existsInRemote = remoteList.includes(key);

    // If it only exists in remote, throw an error
    if (!existsInLocal && existsInRemote) {
      throw new Error(
        `Cannot delete remote index '${key}'. Remote indexes are read-only.`
      );
    }

    // Delete from local (no-op if doesn't exist)
    await this.localStore.delete(key);
  }

  async list(): Promise<string[]> {
    // Get lists from both stores
    const [localList, remoteList] = await Promise.all([
      this.localStore.list(),
      this.remoteStore.list(),
    ]);

    // Merge and deduplicate
    const merged = new Set([...localList, ...remoteList]);
    return Array.from(merged).sort();
  }
}

