/**
 * Shared utility functions
 */

import { createRequire } from "module";

/**
 * Sanitize a key for use in filenames/paths.
 * Replaces unsafe characters with underscores.
 */
export function sanitizeKey(key: string): string {
  return key
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/__+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Get current timestamp in ISO format
 */
export function isoTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Normalize a directory/file path for use with Source APIs.
 *
 * - Removes leading "./" prefix
 * - Removes leading "/" prefix
 * - Removes trailing "/" suffix
 * - Collapses multiple consecutive slashes
 * - Returns "" for root directory representations
 *
 * @example
 * normalizePath("./src")    // "src"
 * normalizePath("/src/")    // "src"
 * normalizePath("src//lib") // "src/lib"
 * normalizePath("./")       // ""
 * normalizePath("/")        // ""
 */
export function normalizePath(path: string): string {
  return path
    .replace(/^\.\//, "") // Remove leading ./
    .replace(/^\/+/, "") // Remove leading slashes
    .replace(/\/+$/, "") // Remove trailing slashes
    .replace(/\/\/+/g, "/"); // Collapse multiple slashes
}


// ============================================================================
// User-Agent utilities for analytics tracking
// ============================================================================

/**
 * Supported client interface types for User-Agent tracking.
 */
export type ClientInterface =
  | 'cli-search'      // ctxc search command
  | 'sdk-search'      // SearchClient programmatic use
  | 'cli-index'       // ctxc index command
  | 'sdk-index'       // Indexer programmatic use
  | 'mcp'             // ctxc mcp command (MCP server mode)
  | 'cli-agent'       // ctxc agent command
  | 'sdk-agent-provider'; // Vercel AI SDK interface

/**
 * MCP client information from the initialize request.
 */
export interface MCPClientInfo {
  name: string;
  version: string;
}

// Lazy-load version to avoid circular imports
let cachedVersion: string | null = null;

/**
 * Get the package version.
 */
function getVersion(): string {
  if (cachedVersion === null) {
    const require = createRequire(import.meta.url);
    const pkg = require('../../package.json');
    cachedVersion = (pkg.version as string) ?? '0.0.0';
  }
  return cachedVersion;
}

/**
 * Build a User-Agent string for analytics tracking.
 * 
 * Format: context-connectors/{version} via:{interface}
 * With MCP client: context-connectors/{version} via:mcp client:{name}/{version}
 * 
 * @param clientInterface - The interface being used
 * @param mcpClientInfo - Optional MCP client info for mcp interface
 * @returns User-Agent string for the request
 * 
 * @example
 * buildClientUserAgent('cli-search')
 * // => 'context-connectors/0.1.3 via:cli-search'
 * 
 * buildClientUserAgent('mcp', { name: 'claude-desktop', version: '1.0.0' })
 * // => 'context-connectors/0.1.3 via:mcp client:claude-desktop/1.0.0'
 */
export function buildClientUserAgent(
  clientInterface: ClientInterface,
  mcpClientInfo?: MCPClientInfo
): string {
  let ua = `context-connectors/${getVersion()} via:${clientInterface}`;
  if (mcpClientInfo) {
    ua += ` client:${mcpClientInfo.name}/${mcpClientInfo.version}`;
  }
  return ua;
}
