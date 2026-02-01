import { describe, expect, it } from "vitest";
import { buildClientUserAgent } from "./utils.js";

describe("buildClientUserAgent", () => {
  it("should build User-Agent for CLI search", () => {
    const ua = buildClientUserAgent("cli-search");
    expect(ua).toMatch(/^augment.ctxc\/[0-9]+\.[0-9]+\.[0-9]+\/cli-search$/);
  });

  it("should build User-Agent for MCP without client info", () => {
    const ua = buildClientUserAgent("mcp");
    expect(ua).toMatch(/^augment.ctxc\/[0-9]+\.[0-9]+\.[0-9]+\/mcp$/);
  });

  it("should build User-Agent for MCP with client info", () => {
    const ua = buildClientUserAgent("mcp", { name: "claude-desktop", version: "1.0.0" });
    expect(ua).toMatch(/^augment.ctxc\/[0-9]+\.[0-9]+\.[0-9]+\/mcp\/claude-desktop\/1\.0\.0$/);
  });

  it("should build User-Agent for MCP with client name only", () => {
    const ua = buildClientUserAgent("mcp", { name: "cursor" });
    expect(ua).toMatch(/^augment.ctxc\/[0-9]+\.[0-9]+\.[0-9]+\/mcp\/cursor$/);
  });

  it("should sanitize MCP client info", () => {
    const ua = buildClientUserAgent("mcp", { name: "My App 2.0", version: "1.2.3-beta" });
    // Spaces and other chars should be replaced with -
    expect(ua).toMatch(/^augment.ctxc\/[0-9]+\.[0-9]+\.[0-9]+\/mcp\/My-App-2\.0\/1\.2\.3-be$/);
  });
});
