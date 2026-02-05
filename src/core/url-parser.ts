/**
 * URL Parser - Parses source URLs to determine type and extract configuration
 *
 * @module core/url-parser
 */

import type { GitHubSourceConfig } from "../sources/github.js";
import type { GitLabSourceConfig } from "../sources/gitlab.js";
import type { BitBucketSourceConfig } from "../sources/bitbucket.js";
import type { WebsiteSourceConfig } from "../sources/website.js";

/**
 * Strip .git suffix from repo/project names
 */
function stripGitSuffix(name: string): string {
  return name.endsWith(".git") ? name.slice(0, -4) : name;
}


/**
 * Result of parsing a source URL
 */
export interface ParsedUrl {
  type: "github" | "gitlab" | "bitbucket" | "website";
  config: GitHubSourceConfig | GitLabSourceConfig | BitBucketSourceConfig | WebsiteSourceConfig;
  defaultIndexName: string;
}

/**
 * Parse a source URL to determine the source type and extract configuration.
 *
 * @param urlString - The URL to parse
 * @returns Parsed URL with type, config, and default index name
 * @throws Error if the URL is invalid
 *
 * @example
 * ```typescript
 * const result = parseSourceUrl("https://github.com/owner/repo/tree/main");
 * // result.type === "github"
 * // result.config === { owner: "owner", repo: "repo", ref: "main" }
 * // result.defaultIndexName === "repo"
 * ```
 */
export function parseSourceUrl(urlString: string): ParsedUrl {
  const url = new URL(urlString);
  const hostname = url.hostname.toLowerCase();

  // GitHub
  if (hostname === "github.com") {
    return parseGitHubUrl(url);
  }

  // GitLab (gitlab.com or hostname contains "gitlab")
  if (hostname === "gitlab.com" || hostname.startsWith("gitlab.")) {
    return parseGitLabUrl(url);
  }

  // Bitbucket (bitbucket.org or hostname contains "bitbucket")
  if (hostname === "bitbucket.org" || hostname.startsWith("bitbucket.")) {
    return parseBitBucketUrl(url);
  }

  // Fallback to website
  return {
    type: "website",
    config: { url: urlString },
    defaultIndexName: hostname,
  };
}

/**
 * Parse a GitHub URL
 * Formats:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo/tree/branch
 * - https://github.com/owner/repo/tree/feature/branch
 * - https://github.com/owner/repo/commit/sha
 */
function parseGitHubUrl(url: URL): ParsedUrl {
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (pathParts.length < 2) {
    throw new Error(`Invalid GitHub URL: ${url.href} - expected owner and repo in path`);
  }

  const owner = pathParts[0];
  const repo = stripGitSuffix(pathParts[1]);
  let ref = "HEAD";

  // Check for tree/branch or commit/sha patterns
  if (pathParts.length >= 4) {
    if (pathParts[2] === "tree" || pathParts[2] === "commit") {
      // Join all remaining parts to handle branch names with slashes
      ref = pathParts.slice(3).join("/");
    }
  }

  return {
    type: "github",
    config: { owner, repo, ref },
    defaultIndexName: repo,
  };
}

/**
 * Parse a GitLab URL
 * Formats:
 * - https://gitlab.com/group/project
 * - https://gitlab.com/group/subgroup/project
 * - https://gitlab.com/group/project/-/tree/branch
 */
function parseGitLabUrl(url: URL): ParsedUrl {
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (pathParts.length < 2) {
    throw new Error(`Invalid GitLab URL: ${url.href} - expected project path`);
  }

  let ref = "HEAD";
  let projectParts = pathParts;

  // Check for /-/tree/branch pattern
  const dashIndex = pathParts.indexOf("-");
  if (dashIndex !== -1) {
    projectParts = pathParts.slice(0, dashIndex);
    // After "-", expect "tree" or "commits" followed by ref
    if (pathParts[dashIndex + 1] === "tree" || pathParts[dashIndex + 1] === "commits") {
      ref = pathParts.slice(dashIndex + 2).join("/");
    }
  }

  // Strip .git suffix from project name if present
  const lastPart = projectParts[projectParts.length - 1];
  if (lastPart.endsWith(".git")) {
    projectParts[projectParts.length - 1] = stripGitSuffix(lastPart);
  }
  const projectId = projectParts.join("/");
  const projectName = projectParts[projectParts.length - 1];

  // Handle self-hosted GitLab
  const baseUrl = url.origin !== "https://gitlab.com" ? url.origin : undefined;

  return {
    type: "gitlab",
    config: { projectId, ref, baseUrl },
    defaultIndexName: projectName,
  };
}

/**
 * Parse a Bitbucket URL
 * Formats:
 * - https://bitbucket.org/workspace/repo
 * - https://bitbucket.org/workspace/repo/src/branch
 * - https://bitbucket.org/workspace/repo/branch/feature
 */
function parseBitBucketUrl(url: URL): ParsedUrl {
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (pathParts.length < 2) {
    throw new Error(`Invalid Bitbucket URL: ${url.href} - expected workspace and repo in path`);
  }

  const workspace = pathParts[0];
  const repo = stripGitSuffix(pathParts[1]);
  let ref = "HEAD";

  // Check for /src/branch or /branch/name patterns
  if (pathParts.length >= 4) {
    if (pathParts[2] === "src" || pathParts[2] === "branch") {
      ref = pathParts.slice(3).join("/");
    }
  }

  // Handle self-hosted Bitbucket
  const baseUrl = url.origin !== "https://bitbucket.org" ? url.origin : undefined;

  return {
    type: "bitbucket",
    config: { workspace, repo, ref, baseUrl },
    defaultIndexName: repo,
  };
}

