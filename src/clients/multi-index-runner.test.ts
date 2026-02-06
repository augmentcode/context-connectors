/**
 * Tests for MultiIndexRunner
 *
 * Tests for createSourceFromState verify that it correctly uses resolvedRef
 * from state metadata when creating source instances.
 *
 * Tests for MultiIndexRunner.refreshIndexList verify that it respects
 * the fixed mode allowlist when refreshing the index list.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IndexStateSearchOnly, SourceMetadata, IndexState } from "../core/types.js";
import type { IndexStoreReader } from "../stores/types.js";
import { MultiIndexRunner } from "./multi-index-runner.js";

// Mock only the sources we actually test
vi.mock("../sources/github.js", () => ({
  GitHubSource: vi.fn().mockImplementation((config) => ({
    type: "github" as const,
    config,
  })),
}));

vi.mock("../sources/website.js", () => ({
  WebsiteSource: vi.fn().mockImplementation((config) => ({
    type: "website" as const,
    config,
  })),
}));

// Import the function under test and mocked sources
import { createSourceFromState } from "./multi-index-runner.js";
import { GitHubSource } from "../sources/github.js";
import { WebsiteSource } from "../sources/website.js";

// Create mock state with specific source metadata
const createMockState = (source: SourceMetadata): IndexStateSearchOnly => ({
  version: 1,
  contextState: {
    version: 1,
  } as any,
  source,
});

describe("createSourceFromState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // All VCS sources (GitHub, GitLab, BitBucket) use the same getRef() logic:
  // resolvedRef ?? config.ref
  // We test this once with GitHub as the representative case.

  it("uses resolvedRef when present", async () => {
    const state = createMockState({
      type: "github",
      config: { owner: "test-owner", repo: "test-repo", ref: "main" },
      resolvedRef: "abc123sha",
      syncedAt: new Date().toISOString(),
    });

    await createSourceFromState(state);

    expect(GitHubSource).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      ref: "abc123sha",
    });
  });

  it("falls back to config.ref when resolvedRef is missing", async () => {
    const state = createMockState({
      type: "github",
      config: { owner: "test-owner", repo: "test-repo", ref: "main" },
      // No resolvedRef
      syncedAt: new Date().toISOString(),
    });

    await createSourceFromState(state);

    expect(GitHubSource).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      ref: "main",
    });
  });

  it("website source works without resolvedRef", async () => {
    const state = createMockState({
      type: "website",
      config: { url: "https://example.com", maxDepth: 2 },
      syncedAt: new Date().toISOString(),
    });

    await createSourceFromState(state);

    expect(WebsiteSource).toHaveBeenCalledWith({
      url: "https://example.com",
      maxDepth: 2,
    });
  });

  it("throws error for unknown source type", async () => {
    const state = createMockState({
      type: "unknown" as any,
      config: {} as any,
      syncedAt: new Date().toISOString(),
    });

    await expect(createSourceFromState(state)).rejects.toThrow(
      "Unknown source type: unknown"
    );
  });
});

describe("MultiIndexRunner.refreshIndexList", () => {
  // Helper to create a mock store with multiple indexes
  const createMockStoreWithIndexes = (indexNames: string[]): IndexStoreReader => {
    const mockState = (name: string): IndexState => ({
      version: 1,
      contextState: { version: 1 } as any,
      source: {
        type: "github",
        config: { owner: "test", repo: name },
        syncedAt: new Date().toISOString(),
      },
    });

    return {
      loadState: vi.fn(),
      loadSearch: vi.fn().mockImplementation((name: string) => {
        if (indexNames.includes(name)) {
          return Promise.resolve(mockState(name));
        }
        return Promise.resolve(null);
      }),
      list: vi.fn().mockResolvedValue(indexNames),
    };
  };

  it("in discovery mode, refreshIndexList includes all indexes from store", async () => {
    const store = createMockStoreWithIndexes(["pytorch", "react", "docs"]);

    const runner = await MultiIndexRunner.create({
      store,
      // No indexNames = discovery mode
    });

    expect(runner.indexNames).toEqual(["pytorch", "react", "docs"]);

    // Simulate store gaining a new index
    (store.list as any).mockResolvedValue(["pytorch", "react", "docs", "vue"]);
    (store.loadSearch as any).mockImplementation((name: string) => {
      if (["pytorch", "react", "docs", "vue"].includes(name)) {
        return Promise.resolve({
          version: 1,
          contextState: { version: 1 } as any,
          source: {
            type: "github",
            config: { owner: "test", repo: name },
            syncedAt: new Date().toISOString(),
          },
        });
      }
      return Promise.resolve(null);
    });

    await runner.refreshIndexList();
    expect(runner.indexNames).toEqual(["pytorch", "react", "docs", "vue"]);
  });

  it("in fixed mode, refreshIndexList respects the original allowlist", async () => {
    const store = createMockStoreWithIndexes(["pytorch", "react", "docs"]);

    // Create runner in fixed mode with only pytorch and react
    const runner = await MultiIndexRunner.create({
      store,
      indexNames: ["pytorch", "react"],
    });

    expect(runner.indexNames).toEqual(["pytorch", "react"]);

    // Simulate store gaining a new index (docs is already there, vue is new)
    (store.list as any).mockResolvedValue(["pytorch", "react", "docs", "vue"]);
    (store.loadSearch as any).mockImplementation((name: string) => {
      if (["pytorch", "react", "docs", "vue"].includes(name)) {
        return Promise.resolve({
          version: 1,
          contextState: { version: 1 } as any,
          source: {
            type: "github",
            config: { owner: "test", repo: name },
            syncedAt: new Date().toISOString(),
          },
        });
      }
      return Promise.resolve(null);
    });

    await runner.refreshIndexList();

    // Should still only include pytorch and react, not docs or vue
    expect(runner.indexNames).toEqual(["pytorch", "react"]);
  });

  it("in fixed mode, refreshIndexList is a no-op even when indexes are deleted", async () => {
    const store = createMockStoreWithIndexes(["pytorch", "react"]);

    // Create runner in fixed mode with pytorch and react
    const runner = await MultiIndexRunner.create({
      store,
      indexNames: ["pytorch", "react"],
    });

    expect(runner.indexNames).toEqual(["pytorch", "react"]);

    // Simulate pytorch being deleted from store
    (store.list as any).mockResolvedValue(["react"]);
    (store.loadSearch as any).mockImplementation((name: string) => {
      if (name === "react") {
        return Promise.resolve({
          version: 1,
          contextState: { version: 1 } as any,
          source: {
            type: "github",
            config: { owner: "test", repo: name },
            syncedAt: new Date().toISOString(),
          },
        });
      }
      return Promise.resolve(null);
    });

    await runner.refreshIndexList();

    // In fixed mode, the list should remain unchanged even though pytorch was deleted
    expect(runner.indexNames).toEqual(["pytorch", "react"]);
  });
});
