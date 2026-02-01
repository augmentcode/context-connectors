import { describe, it, expect } from "vitest";
import { sanitizeKey, normalizePath, buildClientUserAgent } from "./utils.js";

describe("sanitizeKey", () => {
  it("replaces unsafe characters with underscores", () => {
    expect(sanitizeKey("foo/bar/baz")).toBe("foo_bar_baz");
    expect(sanitizeKey("foo:bar")).toBe("foo_bar");
    expect(sanitizeKey("foo@bar.com")).toBe("foo_bar_com");
  });

  it("collapses multiple underscores", () => {
    expect(sanitizeKey("foo//bar")).toBe("foo_bar");
    expect(sanitizeKey("foo___bar")).toBe("foo_bar");
  });

  it("strips leading and trailing underscores", () => {
    expect(sanitizeKey("_foo_")).toBe("foo");
    expect(sanitizeKey("__foo__")).toBe("foo");
  });

  it("preserves safe characters", () => {
    expect(sanitizeKey("foo-bar_baz123")).toBe("foo-bar_baz123");
  });
});

describe("normalizePath", () => {
  it("removes leading ./", () => {
    expect(normalizePath("./src")).toBe("src");
    expect(normalizePath("./foo/bar")).toBe("foo/bar");
  });

  it("removes leading slashes", () => {
    expect(normalizePath("/src")).toBe("src");
    expect(normalizePath("//src")).toBe("src");
  });

  it("removes trailing slashes", () => {
    expect(normalizePath("src/")).toBe("src");
    expect(normalizePath("src//")).toBe("src");
  });

  it("collapses multiple slashes", () => {
    expect(normalizePath("src//lib")).toBe("src/lib");
    expect(normalizePath("a///b//c")).toBe("a/b/c");
  });

  it("returns empty string for root representations", () => {
    expect(normalizePath("./")).toBe("");
    expect(normalizePath("/")).toBe("");
    expect(normalizePath("")).toBe("");
  });
});

describe("buildClientUserAgent", () => {
  it("builds CLI user agent", () => {
    const ua = buildClientUserAgent("cli");
    expect(ua).toMatch(/^augment\.ctxc\.cli\/\d+\.\d+\.\d+/);
  });

  it("builds SDK user agent", () => {
    const ua = buildClientUserAgent("sdk");
    expect(ua).toMatch(/^augment\.ctxc\.sdk\/\d+\.\d+\.\d+/);
  });

  it("builds MCP user agent without client info", () => {
    const ua = buildClientUserAgent("mcp");
    expect(ua).toMatch(/^augment\.ctxc\.mcp\/\d+\.\d+\.\d+$/);
  });

  it("builds MCP user agent with client info", () => {
    const ua = buildClientUserAgent("mcp", { name: "claude-desktop", version: "1.0.0" });
    expect(ua).toMatch(/^augment\.ctxc\.mcp\/\d+\.\d+\.\d+\/claude-desktop\/1\.0\.0$/);
  });

  it("builds MCP user agent with client name only", () => {
    const ua = buildClientUserAgent("mcp", { name: "cursor" });
    expect(ua).toMatch(/^augment\.ctxc\.mcp\/\d+\.\d+\.\d+\/cursor$/);
  });

  it("sanitizes MCP client info - spaces replaced with dashes", () => {
    const ua = buildClientUserAgent("mcp", { name: "My App", version: "1.2.3" });
    // Space replaced with -
    expect(ua).toMatch(/\/My-App\/1\.2\.3$/);
  });

  it("truncates long version strings", () => {
    const ua = buildClientUserAgent("mcp", { name: "app", version: "1.2.3-beta.1" });
    // Version truncated to 8 chars: "1.2.3-be"
    expect(ua).toMatch(/\/app\/1\.2\.3-be$/);
  });
});
