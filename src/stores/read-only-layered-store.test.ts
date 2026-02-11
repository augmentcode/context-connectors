import { describe, it, expect, beforeEach } from "vitest";
import { ReadOnlyLayeredStore } from "./read-only-layered-store.js";
import { MemoryStore } from "./memory.js";
import type { IndexState, IndexStateSearchOnly } from "../core/types.js";

function createMockState(): { full: IndexState; search: IndexStateSearchOnly } {
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
        checkpointId: "test-checkpoint-123",
        addedBlobs: ["blob-1"],
        deletedBlobs: [],
        blobs: [["blob-1", "src/file1.ts"]],
      },
      source,
    },
    search: {
      version: 1,
      contextState: {
        mode: "search-only" as const,
        checkpointId: "test-checkpoint-123",
        addedBlobs: ["blob-1"],
        deletedBlobs: [],
      },
      source,
    },
  };
}

describe("ReadOnlyLayeredStore", () => {
  let primary: MemoryStore;
  let remote: MemoryStore;
  let layered: ReadOnlyLayeredStore;

  beforeEach(() => {
    primary = new MemoryStore();
    remote = new MemoryStore();
    layered = new ReadOnlyLayeredStore(primary, remote);
  });

  describe("list", () => {
    it("returns merged and deduplicated list from both stores", async () => {
      const { full, search } = createMockState();

      // Add to primary
      await primary.save("local-a", full, search);
      await primary.save("local-b", full, search);

      // Add to remote
      await remote.save("remote-a", full, search);
      await remote.save("remote-b", full, search);

      const list = await layered.list();

      expect(list).toContain("local-a");
      expect(list).toContain("local-b");
      expect(list).toContain("remote-a");
      expect(list).toContain("remote-b");
      expect(list.length).toBe(4);
    });

    it("deduplicates when same index exists in both stores", async () => {
      const { full, search } = createMockState();

      // Add same index to both
      await primary.save("shared", full, search);
      await remote.save("shared", full, search);

      const list = await layered.list();

      expect(list).toContain("shared");
      expect(list.length).toBe(1);
    });

    it("returns sorted list", async () => {
      const { full, search } = createMockState();

      await primary.save("zebra", full, search);
      await primary.save("apple", full, search);
      await remote.save("mango", full, search);

      const list = await layered.list();

      expect(list).toEqual(["apple", "mango", "zebra"]);
    });

    it("returns empty list when both stores are empty", async () => {
      const list = await layered.list();
      expect(list).toEqual([]);
    });
  });

  describe("loadSearch", () => {
    it("returns from primary if exists", async () => {
      const { full, search } = createMockState();
      await primary.save("test", full, search);

      const result = await layered.loadSearch("test");

      expect(result).toEqual(search);
    });

    it("falls back to remote if not in primary", async () => {
      const { full, search } = createMockState();
      await remote.save("test", full, search);

      const result = await layered.loadSearch("test");

      expect(result).toEqual(search);
    });

    it("prefers primary over remote when both exist", async () => {
      const { full, search } = createMockState();
      const primarySearch = {
        ...search,
        contextState: { ...search.contextState, checkpointId: "primary" },
      };
      const remoteSearch = {
        ...search,
        contextState: { ...search.contextState, checkpointId: "remote" },
      };

      await primary.save("test", full, primarySearch);
      await remote.save("test", full, remoteSearch);

      const result = await layered.loadSearch("test");

      expect(result?.contextState.checkpointId).toBe("primary");
    });

    it("returns null if not found in either store", async () => {
      const result = await layered.loadSearch("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("loadState", () => {
    it("returns from primary if exists", async () => {
      const { full, search } = createMockState();
      await primary.save("test", full, search);

      const result = await layered.loadState("test");

      expect(result).toEqual(full);
    });

    it("falls back to remote if not in primary", async () => {
      const { full, search } = createMockState();
      await remote.save("test", full, search);

      const result = await layered.loadState("test");

      expect(result).toEqual(full);
    });

    it("prefers primary over remote when both exist", async () => {
      const { full, search } = createMockState();
      const primaryFull = {
        ...full,
        contextState: { ...full.contextState, checkpointId: "primary" },
      };
      const remoteFull = {
        ...full,
        contextState: { ...full.contextState, checkpointId: "remote" },
      };

      await primary.save("test", primaryFull, search);
      await remote.save("test", remoteFull, search);

      const result = await layered.loadState("test");

      expect(result?.contextState.checkpointId).toBe("primary");
    });

    it("returns null if not found in either store", async () => {
      const result = await layered.loadState("nonexistent");
      expect(result).toBeNull();
    });
  });
});

