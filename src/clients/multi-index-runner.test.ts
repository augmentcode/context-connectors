/**
 * Tests for createSourceFromState
 *
 * These tests verify that createSourceFromState correctly uses resolvedRef
 * from state metadata when creating source instances.
 *
 * The tests mock the source modules to capture what config gets passed
 * to the constructors, without needing API credentials.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IndexStateSearchOnly, SourceMetadata } from "../core/types.js";

// Mock the source modules to capture constructor calls
vi.mock("../sources/github.js", () => ({
  GitHubSource: vi.fn().mockImplementation((config) => ({
    type: "github" as const,
    config,
  })),
}));

vi.mock("../sources/gitlab.js", () => ({
  GitLabSource: vi.fn().mockImplementation((config) => ({
    type: "gitlab" as const,
    config,
  })),
}));

vi.mock("../sources/bitbucket.js", () => ({
  BitBucketSource: vi.fn().mockImplementation((config) => ({
    type: "bitbucket" as const,
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
