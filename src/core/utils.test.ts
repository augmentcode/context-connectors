/**
 * Tests for utility functions
 */

import { describe, it, expect } from "vitest";
import { buildClientUserAgent } from "./utils.js";

describe("buildClientUserAgent", () => {
  it("should build basic user agent for cli-search", () => {
    const ua = buildClientUserAgent("cli-search");
    expect(ua).toMatch(/^context-connectors\/\d+\.\d+\.\d+ via:cli-search$/);
  });

  it("should build basic user agent for cli-index", () => {
    const ua = buildClientUserAgent("cli-index");
    expect(ua).toMatch(/^context-connectors\/\d+\.\d+\.\d+ via:cli-index$/);
  });

  it("should build basic user agent for mcp", () => {
    const ua = buildClientUserAgent("mcp");
    expect(ua).toMatch(/^context-connectors\/\d+\.\d+\.\d+ via:mcp$/);
  });

  it("should include MCP client info when provided", () => {
    const ua = buildClientUserAgent("mcp", { name: "claude-desktop", version: "1.2.0" });
    expect(ua).toMatch(/^context-connectors\/\d+\.\d+\.\d+ via:mcp client:claude-desktop\/1\.2\.0$/);
  });

  it("should handle all interface types", () => {
    const interfaces = [
      "cli-search",
      "sdk-search",
      "cli-index",
      "sdk-index",
      "mcp",
      "cli-agent",
      "sdk-agent-provider",
    ] as const;

    for (const iface of interfaces) {
      const ua = buildClientUserAgent(iface);
      expect(ua).toContain(`via:${iface}`);
      expect(ua).toContain("context-connectors/");
    }
  });
});
