/**
 * Tests for LayeredStore
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { LayeredStore } from "./layered-store.js";
import { FilesystemStore } from "./filesystem.js";
import { CompositeStoreReader } from "./composite.js";
import type { IndexState, IndexStateSearchOnly } from "../core/types.js";

const TEST_DIR = "/tmp/context-connectors-test-layered-store";

// Create a minimal mock IndexState for testing
function createMockState(id: string): {
  full: IndexState;
  search: IndexStateSearchOnly;
} {
  const source = {
    type: "github" as const,
    config: { owner: "test-owner", repo: "test-repo" },
    syncedAt: new Date().toISOString(),
  };
  return {
    full: {
      version: 1,
      contextState: {
        mode: "full" as const,
        checkpointId: `checkpoint-${id}`,
        addedBlobs: ["blob-1", "blob-2"],
        deletedBlobs: [],
        blobs: [
          ["blob-1", "src/file1.ts"],
          ["blob-2", "src/file2.ts"],
        ],
      },
      source,
    },
    search: {
      version: 1,
      contextState: {
        mode: "search-only" as const,
        checkpointId: `checkpoint-${id}`,
        addedBlobs: ["blob-1", "blob-2"],
        deletedBlobs: [],
      },
      source,
    },
  };
}

describe("LayeredStore", () => {
  let localStore: FilesystemStore;
  let remoteStore: CompositeStoreReader;
  let layered: LayeredStore;

  beforeEach(async () => {
    // Clean up test directory before each test
    await fs.rm(TEST_DIR, { recursive: true, force: true });

    // Create local store
    localStore = new FilesystemStore({ basePath: TEST_DIR });

    // Create empty remote store (no specs)
    remoteStore = await CompositeStoreReader.fromSpecs([]);

    // Create layered store
    layered = new LayeredStore(localStore, remoteStore);
  });

  afterEach(async () => {
    // Clean up test directory after each test
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("save", () => {
    it("saves to local store only", async () => {
      const { full, search } = createMockState("local");

      await layered.save("test-index", full, search);

      // Verify it was saved to local
      const loaded = await localStore.loadState("test-index");
      expect(loaded).not.toBeNull();
      expect(loaded!.contextState.checkpointId).toBe("checkpoint-local");
    });
  });

  describe("loadState", () => {
    it("loads from local store when available", async () => {
      const { full, search } = createMockState("local");
      await layered.save("test-index", full, search);

      const loaded = await layered.loadState("test-index");

      expect(loaded).not.toBeNull();
      expect(loaded!.contextState.checkpointId).toBe("checkpoint-local");
    });

    it("returns null when index not found in either store", async () => {
      const loaded = await layered.loadState("nonexistent");

      expect(loaded).toBeNull();
    });
  });

  describe("loadSearch", () => {
    it("loads search state from local store when available", async () => {
      const { full, search } = createMockState("local");
      await layered.save("test-index", full, search);

      const loaded = await layered.loadSearch("test-index");

      expect(loaded).not.toBeNull();
      expect(loaded!.contextState.checkpointId).toBe("checkpoint-local");
    });

    it("returns null when search index not found", async () => {
      const loaded = await layered.loadSearch("nonexistent");

      expect(loaded).toBeNull();
    });
  });

  describe("list", () => {
    it("lists indexes from local store", async () => {
      const { full, search } = createMockState("1");
      await layered.save("index-1", full, search);
      await layered.save("index-2", full, search);

      const list = await layered.list();

      expect(list).toContain("index-1");
      expect(list).toContain("index-2");
    });

    it("returns sorted list", async () => {
      const { full, search } = createMockState("1");
      await layered.save("zebra", full, search);
      await layered.save("apple", full, search);
      await layered.save("banana", full, search);

      const list = await layered.list();

      expect(list).toEqual(["apple", "banana", "zebra"]);
    });
  });

  describe("delete", () => {
    it("deletes from local store", async () => {
      const { full, search } = createMockState("local");
      await layered.save("test-index", full, search);

      await layered.delete("test-index");

      const loaded = await layered.loadState("test-index");
      expect(loaded).toBeNull();
    });

    it("throws error when trying to delete remote-only index", async () => {
      // Create a remote store with an index
      const remoteStoreWithIndex = await CompositeStoreReader.fromSpecs([
        { type: "name", displayName: "remote-index", value: "remote-index" },
      ]);

      const layeredWithRemote = new LayeredStore(
        localStore,
        remoteStoreWithIndex
      );

      // Try to delete the remote-only index
      await expect(
        layeredWithRemote.delete("remote-index")
      ).rejects.toThrow(
        "Cannot delete remote index 'remote-index'. Remote indexes are read-only."
      );
    });

    it("allows deletion of local index even if it exists in remote", async () => {
      const { full, search } = createMockState("local");

      // Save to local
      await layered.save("test-index", full, search);

      // Create a remote store with the same index
      const remoteStoreWithIndex = await CompositeStoreReader.fromSpecs([
        { type: "name", displayName: "test-index", value: "test-index" },
      ]);

      const layeredWithRemote = new LayeredStore(
        localStore,
        remoteStoreWithIndex
      );

      // Delete should succeed (deletes from local)
      await expect(layeredWithRemote.delete("test-index")).resolves.toBeUndefined();

      // Verify it's deleted from local but still in remote
      const localLoaded = await localStore.loadState("test-index");
      expect(localLoaded).toBeNull();
    });
  });
});

