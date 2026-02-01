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
 * 
 * Format matches auggie CLI: context-connectors/{version}/{interface}
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
  version?: string;
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
 * Sanitize a string for use in User-Agent per RFC 9110.
 * Only allows: a-z A-Z 0-9 ! # $ % & ' * + . ^ _ ` | ~ -
 */
function sanitizeUserAgentToken(s: string, maxLen: number): string {
  return s.replace(/[^a-zA-Z0-9!#$%&'*+.^_`|~-]/g, "-").slice(0, maxLen);
}

/**
 * Build a User-Agent string for analytics tracking.
 * 
 * Format matches auggie CLI style: context-connectors/{version}/{interface}
 * With MCP client: context-connectors/{version}/mcp/{clientName}
 * 
 * @param clientInterface - The interface being used
 * @param mcpClientInfo - Optional MCP client info for mcp interface
 * @returns User-Agent string for the request
 * 
 * @example
 * buildClientUserAgent('cli-search')
 * // => 'context-connectors/0.1.3/cli-search'
 * 
 * buildClientUserAgent('mcp', { name: 'claude-desktop', version: '1.0.0' })
 * // => 'context-connectors/0.1.3/mcp/claude-desktop/1.0.0'
 */
export function buildClientUserAgent(
  clientInterface: ClientInterface,
  mcpClientInfo?: MCPClientInfo
): string {
  const version = getVersion();
  
  if (clientInterface === 'mcp' && mcpClientInfo) {
    // Sanitize MCP client info per RFC 9110 (same as auggie CLI)
    const name = sanitizeUserAgentToken(mcpClientInfo.name, 32);
    const clientVersion = mcpClientInfo.version 
      ? sanitizeUserAgentToken(mcpClientInfo.version, 8)
      : undefined;
    const clientName = clientVersion ? `${name}/${clientVersion}` : name;
    return `context-connectors/${version}/mcp/${clientName}`;
  }
  
  return `context-connectors/${version}/${clientInterface}`;
}
