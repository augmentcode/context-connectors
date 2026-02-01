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
 * Client product types for User-Agent tracking.
 * 
 * Format: augment.ctxc.{product}/{version}
 * 
 * - cli: CLI commands (ctxc search, ctxc agent, ctxc index)
 * - mcp: MCP server mode (ctxc mcp)
 * - sdk: SDK/programmatic usage
 */
export type ClientProduct = 'cli' | 'mcp' | 'sdk';

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
 * Only allows: a-z A-Z 0-9 \! # $ % & ' * + . ^ _ ` | ~ -
 */
function sanitizeUserAgentToken(s: string, maxLen: number): string {
  return s.replace(/[^a-zA-Z0-9\!#$%&'*+.^_`|~-]/g, "-").slice(0, maxLen);
}

/**
 * Build a User-Agent string for analytics tracking.
 * 
 * Simplified format:
 * - CLI:  augment.ctxc.cli/{version}
 * - MCP:  augment.ctxc.mcp/{version}
 * - SDK:  augment.ctxc.sdk/{version}
 * 
 * With MCP client info:
 * - augment.ctxc.mcp/{version}/{clientName}/{clientVersion}
 * 
 * @param product - The product being used (cli, mcp, sdk)
 * @param mcpClientInfo - Optional MCP client info
 * @returns User-Agent string for the request
 * 
 * @example
 * buildClientUserAgent('cli')
 * // => 'augment.ctxc.cli/0.1.3'
 * 
 * buildClientUserAgent('mcp', { name: 'claude-desktop', version: '1.0.0' })
 * // => 'augment.ctxc.mcp/0.1.3/claude-desktop/1.0.0'
 */
export function buildClientUserAgent(
  product: ClientProduct,
  mcpClientInfo?: MCPClientInfo
): string {
  const version = getVersion();
  const base = `augment.ctxc.${product}/${version}`;
  
  if (product === 'mcp' && mcpClientInfo) {
    // Sanitize MCP client info per RFC 9110 (same as auggie CLI)
    const name = sanitizeUserAgentToken(mcpClientInfo.name, 32);
    const clientVersion = mcpClientInfo.version 
      ? sanitizeUserAgentToken(mcpClientInfo.version, 8)
      : undefined;
    const clientSuffix = clientVersion ? `${name}/${clientVersion}` : name;
    return `${base}/${clientSuffix}`;
  }
  
  return base;
}
