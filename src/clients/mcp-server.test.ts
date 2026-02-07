/**
 * Tests for MCP Server
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IndexState } from "../core/types.js";
import type { IndexStoreReader } from "../stores/types.js";
import type { Source } from "../sources/types.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Try to import SDK-dependent modules
let createMCPServer: typeof import("./mcp-server.js").createMCPServer;
let sdkLoadError: Error | null = null;

try {
  const mcpMod = await import("./mcp-server.js");
  createMCPServer = mcpMod.createMCPServer;
} catch (e) {
  sdkLoadError = e as Error;
}

// Create mock IndexState
const createMockState = (): IndexState => ({
  version: 1,
  contextState: {
    blobs: [],
    version: 1,
  } as any,
  source: {
    type: "github",
    config: { owner: "test-owner", repo: "test-repo" },
    syncedAt: new Date().toISOString(),
  },
});

// Create mock Store
const createMockStore = (state: IndexState | null): IndexStoreReader => ({
  loadState: vi.fn().mockResolvedValue(state),
  loadSearch: vi.fn().mockResolvedValue(state),
  list: vi.fn().mockResolvedValue(state ? ["test-key"] : []),
});

// Create mock Source
const createMockSource = (): Source =>
  ({
    type: "github" as const,
    listFiles: vi.fn().mockResolvedValue([
      { path: "src/index.ts" },
      { path: "src/utils.ts" },
      { path: "README.md" },
    ]),
    readFile: vi.fn().mockImplementation((path: string) => {
      if (path === "src/index.ts") {
        return Promise.resolve("export const version = '1.0.0';");
      }
      if (path === "not-found.ts") {
        return Promise.reject(new Error("File not found"));
      }
      return Promise.resolve("file content");
    }),
    fetchAll: vi.fn(),
    fetchChanges: vi.fn(),
    getMetadata: vi.fn().mockResolvedValue({
      type: "github",
      config: { owner: "test-owner", repo: "test-repo" },
      syncedAt: new Date().toISOString(),
    }),
  }) as unknown as Source;

// Check if API credentials are available for tests
const hasApiCredentials = !!(
  process.env.AUGMENT_API_TOKEN && process.env.AUGMENT_API_URL
);

describe.skipIf(sdkLoadError !== null || !hasApiCredentials)(
  "MCP Server",
  () => {
    describe("createMCPServer", () => {
      it("creates server with search tool only when searchOnly is true", async () => {
        const store = createMockStore(createMockState());
        const server = await createMCPServer({
          store,
          indexNames: ["test-key"],
          searchOnly: true,
        });

        expect(server).toBeDefined();
      });

      it("creates server with file tools when searchOnly is false", async () => {
        const store = createMockStore(createMockState());

        const server = await createMCPServer({
          store,
          indexNames: ["test-key"],
          searchOnly: false,
        });

        expect(server).toBeDefined();
      });

      it("uses custom serverName and version", async () => {
        const store = createMockStore(createMockState());

        const server = await createMCPServer({
          store,
          indexNames: ["test-key"],
          serverName: "custom-server",
          version: "2.0.0",
        });

        expect(server).toBeDefined();
      });

      it("throws error when index not found", async () => {
        const store = createMockStore(null);

        await expect(
          createMCPServer({
            store,
            indexNames: ["missing-key"],
          })
        ).rejects.toThrow("Indexes not found: missing-key");
      });
    });
  }
);

// Unit tests that don't need API credentials
describe.skipIf(sdkLoadError !== null)("MCP Server Unit Tests", () => {
  describe("module loading", () => {
    it("exports createMCPServer function", () => {
      expect(typeof createMCPServer).toBe("function");
    });
  });
});

// Tests for list_indexes tool and discovery vs fixed mode
describe.skipIf(sdkLoadError !== null || !hasApiCredentials)(
  "list_indexes tool and discovery mode",
  () => {
    describe("list_indexes tool", () => {
      it("returns available indexes with metadata", async () => {
        const mockState = createMockState();
        const store = createMockStore(mockState);

        const server = await createMCPServer({
          store,
          indexNames: ["test-key"],
        });

        // Get the ListToolsRequestSchema handler
        const listToolsHandler = (server as any).requestHandlers.get(
          ListToolsRequestSchema
        );
        expect(listToolsHandler).toBeDefined();

        // Call the handler to get tools
        const result = await listToolsHandler();
        const listIndexesTool = result.tools.find(
          (t: any) => t.name === "list_indexes"
        );
        expect(listIndexesTool).toBeDefined();
        expect(listIndexesTool.description).toContain("available indexes");
      });

      it("returns 'No indexes available' message when empty in discovery mode", async () => {
        const store = createMockStore(null);
        // Mock store.list() to return empty array for discovery mode
        store.list = vi.fn().mockResolvedValue([]);

        const server = await createMCPServer({
          store,
          indexNames: [],
          discovery: true,
        });

        // Get the CallToolRequestSchema handler
        const callToolHandler = (server as any).requestHandlers.get(
          CallToolRequestSchema
        );
        expect(callToolHandler).toBeDefined();

        // Call list_indexes
        const result = await callToolHandler({
          params: {
            name: "list_indexes",
            arguments: {},
          },
        });

        expect(result.content[0].text).toContain("No indexes available");
      });

      it("handles errors gracefully and returns isError: true", async () => {
        const store = createMockStore(createMockState());
        // Mock store.list() to throw an error
        store.list = vi.fn().mockRejectedValue(new Error("Store error"));

        const server = await createMCPServer({
          store,
          indexNames: ["test-key"],
          discovery: true,
        });

        // Get the CallToolRequestSchema handler
        const callToolHandler = (server as any).requestHandlers.get(
          CallToolRequestSchema
        );

        // Call list_indexes
        const result = await callToolHandler({
          params: {
            name: "list_indexes",
            arguments: {},
          },
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Error listing indexes");
      });
    });

    describe("discovery vs fixed mode", () => {
      it("fixed mode includes enum in tool schemas for index_name", async () => {
        const mockState = createMockState();
        const store = createMockStore(mockState);

        const server = await createMCPServer({
          store,
          indexNames: ["test-key"],
          discovery: false, // Fixed mode
        });

        // Get the ListToolsRequestSchema handler
        const listToolsHandler = (server as any).requestHandlers.get(
          ListToolsRequestSchema
        );
        const result = await listToolsHandler();

        // Check search tool has enum
        const searchTool = result.tools.find((t: any) => t.name === "search");
        expect(searchTool.inputSchema.properties.index_name.enum).toBeDefined();
        expect(searchTool.inputSchema.properties.index_name.enum).toContain(
          "test-key"
        );

        // Check list_files tool has enum (if present)
        const listFilesTool = result.tools.find(
          (t: any) => t.name === "list_files"
        );
        if (listFilesTool) {
          expect(listFilesTool.inputSchema.properties.index_name.enum).toBeDefined();
          expect(listFilesTool.inputSchema.properties.index_name.enum).toContain(
            "test-key"
          );
        }

        // Check read_file tool has enum (if present)
        const readFileTool = result.tools.find((t: any) => t.name === "read_file");
        if (readFileTool) {
          expect(readFileTool.inputSchema.properties.index_name.enum).toBeDefined();
          expect(readFileTool.inputSchema.properties.index_name.enum).toContain(
            "test-key"
          );
        }
      });

      it("discovery mode does NOT include enum in tool schemas", async () => {
        const mockState = createMockState();
        const store = createMockStore(mockState);

        const server = await createMCPServer({
          store,
          indexNames: ["test-key"],
          discovery: true, // Discovery mode
        });

        // Get the ListToolsRequestSchema handler
        const listToolsHandler = (server as any).requestHandlers.get(
          ListToolsRequestSchema
        );
        const result = await listToolsHandler();

        // Check search tool does NOT have enum
        const searchTool = result.tools.find((t: any) => t.name === "search");
        expect(searchTool.inputSchema.properties.index_name.enum).toBeUndefined();

        // Check list_files tool does NOT have enum (if present)
        const listFilesTool = result.tools.find(
          (t: any) => t.name === "list_files"
        );
        if (listFilesTool) {
          expect(listFilesTool.inputSchema.properties.index_name.enum).toBeUndefined();
        }

        // Check read_file tool does NOT have enum (if present)
        const readFileTool = result.tools.find((t: any) => t.name === "read_file");
        if (readFileTool) {
          expect(readFileTool.inputSchema.properties.index_name.enum).toBeUndefined();
        }
      });

      it("list_indexes tool is available in both fixed and discovery modes", async () => {
        const mockState = createMockState();
        const store = createMockStore(mockState);

        // Test fixed mode
        const fixedServer = await createMCPServer({
          store,
          indexNames: ["test-key"],
          discovery: false,
        });

        const fixedListToolsHandler = (fixedServer as any).requestHandlers.get(
          ListToolsRequestSchema
        );
        const fixedResult = await fixedListToolsHandler();
        const fixedListIndexesTool = fixedResult.tools.find(
          (t: any) => t.name === "list_indexes"
        );
        expect(fixedListIndexesTool).toBeDefined();

        // Test discovery mode
        const discoveryServer = await createMCPServer({
          store,
          indexNames: ["test-key"],
          discovery: true,
        });

        const discoveryListToolsHandler = (discoveryServer as any).requestHandlers.get(
          ListToolsRequestSchema
        );
        const discoveryResult = await discoveryListToolsHandler();
        const discoveryListIndexesTool = discoveryResult.tools.find(
          (t: any) => t.name === "list_indexes"
        );
        expect(discoveryListIndexesTool).toBeDefined();
      });
    });
  }
);

