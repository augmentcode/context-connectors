import { describe, it, expect } from "vitest";
import { 
  sanitizeKey, 
  normalizePath, 
  buildClientUserAgent,
  type MCPClientInfo 
} from "./utils.js";

describe("sanitizeKey", () => {
  it("should replace unsafe characters with underscores", () => {
    expect(sanitizeKey("foo/bar")).toBe("foo_bar");
    expect(sanitizeKey("foo:bar")).toBe("foo_bar");
    expect(sanitizeKey("foo@bar")).toBe("foo_bar");
  });

  it("should collapse multiple underscores", () => {
    expect(sanitizeKey("foo//bar")).toBe("foo_bar");
    expect(sanitizeKey("foo:::bar")).toBe("foo_bar");
  });

  it("should trim leading/trailing underscores", () => {
    expect(sanitizeKey("/foo")).toBe("foo");
    expect(sanitizeKey("foo/")).toBe("foo");
  });

  it("should keep valid characters", () => {
    expect(sanitizeKey("foo-bar_baz")).toBe("foo-bar_baz");
    expect(sanitizeKey("FooBar123")).toBe("FooBar123");
  });
});

describe("normalizePath", () => {
  it("removes leading ./", () => {
    expect(normalizePath("./src")).toBe("src");
    expect(normalizePath("./foo/bar")).toBe("foo/bar");
  });

  it("removes leading /", () => {
    expect(normalizePath("/src")).toBe("src");
    expect(normalizePath("///src")).toBe("src");
  });

  it("removes trailing /", () => {
    expect(normalizePath("src/")).toBe("src");
    expect(normalizePath("src///")).toBe("src");
  });

  it("collapses multiple slashes", () => {
    expect(normalizePath("src//lib")).toBe("src/lib");
    expect(normalizePath("a//b//c")).toBe("a/b/c");
  });

  it("handles root paths", () => {
    expect(normalizePath("./")).toBe("");
    expect(normalizePath("/")).toBe("");
    expect(normalizePath("")).toBe("");
  });

  it("handles complex paths", () => {
    expect(normalizePath("./src//lib/")).toBe("src/lib");
    expect(normalizePath("///a//b//c///")).toBe("a/b/c");
  });
});

describe("buildClientUserAgent", () => {
  it("builds CLI User-Agent", () => {
    const ua = buildClientUserAgent("cli");
    expect(ua).toMatch(/^augment\.ctxc\.cli\/[\d.]+/);
  });

  it("builds MCP User-Agent", () => {
    const ua = buildClientUserAgent("mcp");
    expect(ua).toMatch(/^augment\.ctxc\.mcp\/[\d.]+/);
  });

  it("builds SDK User-Agent", () => {
    const ua = buildClientUserAgent("sdk");
    expect(ua).toMatch(/^augment\.ctxc\.sdk\/[\d.]+/);
  });

  it("appends MCP client info with name and version", () => {
    const mcpClientInfo: MCPClientInfo = {
      name: "claude-desktop",
      version: "1.0.0"
    };
    const ua = buildClientUserAgent("mcp", mcpClientInfo);
    expect(ua).toMatch(/^augment\.ctxc\.mcp\/[\d.]+\/claude-desktop\/1\.0\.0$/);
  });

  it("appends MCP client info with name only", () => {
    const mcpClientInfo: MCPClientInfo = {
      name: "cursor"
    };
    const ua = buildClientUserAgent("mcp", mcpClientInfo);
    expect(ua).toMatch(/^augment\.ctxc\.mcp\/[\d.]+\/cursor$/);
  });

  it("sanitizes MCP client name per RFC 9110", () => {
    const mcpClientInfo: MCPClientInfo = {
      name: "My App",  // space not allowed
      version: "1.0"
    };
    const ua = buildClientUserAgent("mcp", mcpClientInfo);
    expect(ua).toContain("/My-App/");  // space replaced with -
  });

  it("truncates long client names to 32 chars", () => {
    const mcpClientInfo: MCPClientInfo = {
      name: "a".repeat(50),
      version: "1.0"
    };
    const ua = buildClientUserAgent("mcp", mcpClientInfo);
    // Should contain 32 'a's, not 50
    expect(ua).toContain("/" + "a".repeat(32) + "/");
  });

  it("truncates long versions to 8 chars", () => {
    const mcpClientInfo: MCPClientInfo = {
      name: "app",
      version: "1.2.3-beta.4"  // 12 chars
    };
    const ua = buildClientUserAgent("mcp", mcpClientInfo);
    // Version should be truncated to 8 chars: "1.2.3-be"
    expect(ua).toMatch(/\/app\/1\.2\.3-be$/);
  });

  it("ignores MCP client info for non-MCP products", () => {
    const mcpClientInfo: MCPClientInfo = {
      name: "should-be-ignored",
      version: "1.0"
    };
    const ua = buildClientUserAgent("cli", mcpClientInfo);
    expect(ua).not.toContain("should-be-ignored");
    expect(ua).toMatch(/^augment\.ctxc\.cli\/[\d.]+$/);
  });
});
