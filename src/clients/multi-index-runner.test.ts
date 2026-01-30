/**
 * Tests for MultiIndexRunner
 * 
 * These tests verify that createSourceFromState correctly uses resolvedRef
 * from state metadata when creating source instances.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IndexStateSearchOnly, SourceMetadata } from "../core/types.js";
import type { IndexStoreReader } from "../stores/types.js";

// Mock the source modules
vi.mock("../sources/github.js", () => ({
  GitHubSource: vi.fn().mockImplementation((config) => ({
    type: "github" as const,
    config,
    listFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(""),
    fetchAll: vi.fn(),
    fetchChanges: vi.fn(),
    getMetadata: vi.fn().mockResolvedValue({
      type: "github",
      config,
      syncedAt: new Date().toISOString(),
    }),
  })),
}));

vi.mock("../sources/gitlab.js", () => ({
  GitLabSource: vi.fn().mockImplementation((config) => ({
    type: "gitlab" as const,
    config,
    listFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(""),
    fetchAll: vi.fn(),
    fetchChanges: vi.fn(),
    getMetadata: vi.fn().mockResolvedValue({
      type: "gitlab",
      config,
      syncedAt: new Date().toISOString(),
    }),
  })),
}));

vi.mock("../sources/bitbucket.js", () => ({
  BitBucketSource: vi.fn().mockImplementation((config) => ({
    type: "bitbucket" as const,
    config,
    listFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(""),
    fetchAll: vi.fn(),
    fetchChanges: vi.fn(),
    getMetadata: vi.fn().mockResolvedValue({
      type: "bitbucket",
      config,
      syncedAt: new Date().toISOString(),
    }),
  })),
}));

vi.mock("../sources/website.js", () => ({
  WebsiteSource: vi.fn().mockImplementation((config) => ({
    type: "website" as const,
    config,
    listFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(""),
    fetchAll: vi.fn(),
    fetchChanges: vi.fn(),
    getMetadata: vi.fn().mockResolvedValue({
      type: "website",
      config,
      syncedAt: new Date().toISOString(),
    }),
  })),
}));

// Try to import SDK-dependent modules
let MultiIndexRunner: typeof import("./multi-index-runner.js").MultiIndexRunner;
let sdkLoadError: Error | null = null;

try {
  const mod = await import("./multi-index-runner.js");
  MultiIndexRunner = mod.MultiIndexRunner;
} catch (e) {
  sdkLoadError = e as Error;
}

import { GitHubSource } from "../sources/github.js";
import { GitLabSource } from "../sources/gitlab.js";
import { BitBucketSource } from "../sources/bitbucket.js";
import { WebsiteSource } from "../sources/website.js";

// Create mock state with specific source metadata
const createMockState = (source: SourceMetadata): IndexStateSearchOnly => ({
  version: 1,
  contextState: {
    version: 1,
  } as any,
  source,
});

// Create mock store
const createMockStore = (stateMap: Map<string, IndexStateSearchOnly>): IndexStoreReader => ({
  loadState: vi.fn().mockImplementation(async (name: string) => stateMap.get(name) ?? null),
  loadSearch: vi.fn().mockImplementation(async (name: string) => stateMap.get(name) ?? null),
  list: vi.fn().mockResolvedValue(Array.from(stateMap.keys())),
});

// Check if API credentials are available for tests
const hasApiCredentials = !!(
  process.env.AUGMENT_API_TOKEN && process.env.AUGMENT_API_URL
);

describe.skipIf(sdkLoadError !== null || !hasApiCredentials)("MultiIndexRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSourceFromState via getClient", () => {
    it("uses resolvedRef for GitHub source when present", async () => {
      const state = createMockState({
        type: "github",
        config: { owner: "test-owner", repo: "test-repo", ref: "main" },
        resolvedRef: "abc123sha",
        syncedAt: new Date().toISOString(),
      });
      const stateMap = new Map([["test-index", state]]);
      const store = createMockStore(stateMap);

      const runner = await MultiIndexRunner.create({ store });
      await runner.getClient("test-index");

      expect(GitHubSource).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        ref: "abc123sha",
      });
    });

    it("uses resolvedRef for GitLab source when present", async () => {
      const state = createMockState({
        type: "gitlab",
        config: { projectId: "group/project", ref: "main" },
        resolvedRef: "def456sha",
        syncedAt: new Date().toISOString(),
      });
      const stateMap = new Map([["test-index", state]]);
      const store = createMockStore(stateMap);

      const runner = await MultiIndexRunner.create({ store });
      await runner.getClient("test-index");

      expect(GitLabSource).toHaveBeenCalledWith({
        projectId: "group/project",
        ref: "def456sha",
      });
    });

    it("uses resolvedRef for BitBucket source when present", async () => {
      const state = createMockState({
        type: "bitbucket",
        config: { workspace: "my-workspace", repo: "my-repo", ref: "develop" },
        resolvedRef: "ghi789sha",
        syncedAt: new Date().toISOString(),
      });
      const stateMap = new Map([["test-index", state]]);
      const store = createMockStore(stateMap);

      const runner = await MultiIndexRunner.create({ store });
      await runner.getClient("test-index");

      expect(BitBucketSource).toHaveBeenCalledWith({
        workspace: "my-workspace",
        repo: "my-repo",
        ref: "ghi789sha",
      });
    });

    it("uses original config.ref when resolvedRef is missing for GitHub", async () => {
      const state = createMockState({
        type: "github",
        config: { owner: "test-owner", repo: "test-repo", ref: "main" },
        // No resolvedRef
        syncedAt: new Date().toISOString(),
      });
      const stateMap = new Map([["test-index", state]]);
      const store = createMockStore(stateMap);

      const runner = await MultiIndexRunner.create({ store });
      await runner.getClient("test-index");

      expect(GitHubSource).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        ref: "main",
      });
    });

    it("uses original config.ref when resolvedRef is undefined for GitLab", async () => {
      const state = createMockState({
        type: "gitlab",
        config: { projectId: "group/project", ref: "develop" },
        resolvedRef: undefined,
        syncedAt: new Date().toISOString(),
      });
      const stateMap = new Map([["test-index", state]]);
      const store = createMockStore(stateMap);

      const runner = await MultiIndexRunner.create({ store });
      await runner.getClient("test-index");

      expect(GitLabSource).toHaveBeenCalledWith({
        projectId: "group/project",
        ref: "develop",
      });
    });

    it("website source works correctly without resolvedRef", async () => {
      const state = createMockState({
        type: "website",
        config: { url: "https://example.com", maxDepth: 2 },
        syncedAt: new Date().toISOString(),
      });
      const stateMap = new Map([["test-index", state]]);
      const store = createMockStore(stateMap);

      const runner = await MultiIndexRunner.create({ store });
      await runner.getClient("test-index");

      expect(WebsiteSource).toHaveBeenCalledWith({
        url: "https://example.com",
        maxDepth: 2,
      });
    });
  });
});
