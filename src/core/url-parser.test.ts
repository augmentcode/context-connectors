import { describe, it, expect } from "vitest";
import { parseSourceUrl } from "./url-parser.js";

describe("parseSourceUrl", () => {
  describe("GitHub URLs", () => {
    it("parses basic github.com URL", () => {
      const result = parseSourceUrl("https://github.com/owner/repo");
      expect(result.type).toBe("github");
      expect(result.config).toEqual({ owner: "owner", repo: "repo", ref: "HEAD" });
      expect(result.defaultIndexName).toBe("repo");
    });

    it("parses GitHub URL with tree/branch", () => {
      const result = parseSourceUrl("https://github.com/owner/repo/tree/main");
      expect(result.type).toBe("github");
      expect(result.config).toEqual({ owner: "owner", repo: "repo", ref: "main" });
      expect(result.defaultIndexName).toBe("repo");
    });

    it("parses GitHub URL with tree/feature/branch (slashes in branch name)", () => {
      const result = parseSourceUrl("https://github.com/owner/repo/tree/feature/branch");
      expect(result.type).toBe("github");
      expect(result.config).toEqual({ owner: "owner", repo: "repo", ref: "feature/branch" });
      expect(result.defaultIndexName).toBe("repo");
    });

    it("parses GitHub URL with commit SHA", () => {
      const result = parseSourceUrl("https://github.com/owner/repo/commit/abc123def456");
      expect(result.type).toBe("github");
      expect(result.config).toEqual({ owner: "owner", repo: "repo", ref: "abc123def456" });
      expect(result.defaultIndexName).toBe("repo");
    });

    it("throws on invalid GitHub URL without repo", () => {
      expect(() => parseSourceUrl("https://github.com/owner")).toThrow("Invalid GitHub URL");
    });
  });

  describe("GitLab URLs", () => {
    it("parses basic gitlab.com URL", () => {
      const result = parseSourceUrl("https://gitlab.com/group/project");
      expect(result.type).toBe("gitlab");
      expect(result.config).toEqual({ projectId: "group/project", ref: "HEAD", baseUrl: undefined });
      expect(result.defaultIndexName).toBe("project");
    });

    it("parses GitLab URL with subgroups", () => {
      const result = parseSourceUrl("https://gitlab.com/group/subgroup/project");
      expect(result.type).toBe("gitlab");
      expect(result.config).toEqual({
        projectId: "group/subgroup/project",
        ref: "HEAD",
        baseUrl: undefined,
      });
      expect(result.defaultIndexName).toBe("project");
    });

    it("parses GitLab URL with /-/tree/branch", () => {
      const result = parseSourceUrl("https://gitlab.com/group/project/-/tree/main");
      expect(result.type).toBe("gitlab");
      expect(result.config).toEqual({ projectId: "group/project", ref: "main", baseUrl: undefined });
      expect(result.defaultIndexName).toBe("project");
    });

    it("parses GitLab URL with /-/tree/feature/branch", () => {
      const result = parseSourceUrl("https://gitlab.com/group/project/-/tree/feature/branch");
      expect(result.type).toBe("gitlab");
      expect(result.config).toEqual({
        projectId: "group/project",
        ref: "feature/branch",
        baseUrl: undefined,
      });
    });

    it("parses self-hosted GitLab URL", () => {
      const result = parseSourceUrl("https://gitlab.mycompany.com/team/project");
      expect(result.type).toBe("gitlab");
      expect(result.config).toEqual({
        projectId: "team/project",
        ref: "HEAD",
        baseUrl: "https://gitlab.mycompany.com",
      });
      expect(result.defaultIndexName).toBe("project");
    });

    it("throws on invalid GitLab URL", () => {
      expect(() => parseSourceUrl("https://gitlab.com/group")).toThrow("Invalid GitLab URL");
    });
  });

  describe("Bitbucket URLs", () => {
    it("parses basic bitbucket.org URL", () => {
      const result = parseSourceUrl("https://bitbucket.org/workspace/repo");
      expect(result.type).toBe("bitbucket");
      expect(result.config).toEqual({
        workspace: "workspace",
        repo: "repo",
        ref: "HEAD",
        baseUrl: undefined,
      });
      expect(result.defaultIndexName).toBe("repo");
    });

    it("parses Bitbucket URL with /src/branch", () => {
      const result = parseSourceUrl("https://bitbucket.org/workspace/repo/src/main");
      expect(result.type).toBe("bitbucket");
      expect(result.config).toEqual({
        workspace: "workspace",
        repo: "repo",
        ref: "main",
        baseUrl: undefined,
      });
    });

    it("parses Bitbucket URL with /branch/feature", () => {
      const result = parseSourceUrl("https://bitbucket.org/workspace/repo/branch/feature");
      expect(result.type).toBe("bitbucket");
      expect(result.config).toEqual({
        workspace: "workspace",
        repo: "repo",
        ref: "feature",
        baseUrl: undefined,
      });
    });

    it("parses self-hosted Bitbucket URL", () => {
      const result = parseSourceUrl("https://bitbucket.mycompany.com/workspace/repo");
      expect(result.type).toBe("bitbucket");
      expect(result.config).toEqual({
        workspace: "workspace",
        repo: "repo",
        ref: "HEAD",
        baseUrl: "https://bitbucket.mycompany.com",
      });
    });

    it("throws on invalid Bitbucket URL", () => {
      expect(() => parseSourceUrl("https://bitbucket.org/workspace")).toThrow("Invalid Bitbucket URL");
    });
  });

  describe("Website URLs (fallback)", () => {
    it("parses unknown URL as website", () => {
      const result = parseSourceUrl("https://docs.example.com/api/v2");
      expect(result.type).toBe("website");
      expect(result.config).toEqual({ url: "https://docs.example.com/api/v2" });
      expect(result.defaultIndexName).toBe("docs.example.com");
    });

    it("uses hostname as default index name for website", () => {
      const result = parseSourceUrl("https://react.dev/learn/thinking-in-react");
      expect(result.type).toBe("website");
      expect(result.defaultIndexName).toBe("react.dev");
    });
  });

  describe("Invalid URLs", () => {
    it("throws on invalid URL format", () => {
      expect(() => parseSourceUrl("not-a-url")).toThrow();
    });
  });
});

