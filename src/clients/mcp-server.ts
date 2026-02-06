/**
 * MCP Server - Exposes context-connector tools to AI assistants.
 *
 * Implements the Model Context Protocol (MCP) to enable integration with:
 * - Claude Desktop
 * - Other MCP-compatible AI assistants
 *
 * The server exposes these tools:
 * - `search`: Search across one or more indexes
 * - `list_files`: List files in an index (when source available)
 * - `read_file`: Read file contents (when source available)
 *
 * @module clients/mcp-server
 * @see https://modelcontextprotocol.io/
 *
 * @example
 * ```typescript
 * import { runMCPServer } from "@augmentcode/context-connectors";
 * import { FilesystemStore } from "@augmentcode/context-connectors/stores";
 *
 * // Serve all indexes in the store
 * await runMCPServer({
 *   store: new FilesystemStore(),
 * });
 *
 * // Serve specific indexes only
 * await runMCPServer({
 *   store: new FilesystemStore(),
 *   indexNames: ["react", "docs"],
 * });
 * ```
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { IndexStoreReader, IndexStore } from "../stores/types.js";
import type { Source } from "../sources/types.js";
import { MultiIndexRunner } from "./multi-index-runner.js";
import {
  SEARCH_DESCRIPTION,
  LIST_FILES_DESCRIPTION,
  READ_FILE_DESCRIPTION,
  withListIndexesReference,
  withIndexList,
} from "./tool-descriptions.js";

/**
 * Configuration for the MCP server.
 */
export interface MCPServerConfig {
  /** Store to load indexes from (accepts both reader-only and full store) */
  store: IndexStoreReader | IndexStore;
  /**
   * Index names to expose. If undefined, all indexes in the store are exposed.
   */
  indexNames?: string[];
  /**
   * Disable file operations (list_files, read_file).
   * When true, only search is available.
   */
  searchOnly?: boolean;
  /**
   * Server name reported to MCP clients.
   * @default "context-connectors"
   */
  serverName?: string;
  /**
   * Server version reported to MCP clients.
   * @default "0.1.0"
   */
  version?: string;
  /**
   * Agent-managed mode flag.
   * When true: use withListIndexesReference (no enum in schemas)
   * When false/undefined: use withIndexList (include enum in schemas)
   * @default false
   */
  agentManaged?: boolean;
}

/**
 * Create an MCP server instance.
 *
 * Creates but does not start the server. Use `runMCPServer()` for
 * the common case of running with stdio transport.
 *
 * @param config - Server configuration
 * @returns Configured MCP Server instance
 *
 * @example
 * ```typescript
 * const server = await createMCPServer({
 *   store: new FilesystemStore(),
 * });
 *
 * // Connect with custom transport
 * await server.connect(myTransport);
 * ```
 */
export async function createMCPServer(
  config: MCPServerConfig
): Promise<Server> {
  // Create shared runner for multi-index operations
  const runner = await MultiIndexRunner.create({
    store: config.store,
    indexNames: config.indexNames,
    searchOnly: config.searchOnly,
  });

  const searchOnly = !runner.hasFileOperations();

  // Create MCP server
  const server = new Server(
    {
      name: config.serverName ?? "context-connectors",
      version: config.version ?? "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Define tool type for type safety
  type Tool = {
    name: string;
    description: string;
    inputSchema: {
      type: "object";
      properties: Record<
        string,
        { type: string; description: string; enum?: string[] }
      >;
      required?: string[];
    };
  };

  // Tool descriptions: use enum in fixed mode, reference in agent-managed mode
  let searchDescription: string;
  let listFilesDescription: string;
  let readFileDescription: string;

  if (config.agentManaged) {
    // Agent-managed mode: use reference to list_indexes (no enum)
    searchDescription = withListIndexesReference(SEARCH_DESCRIPTION);
    listFilesDescription = withListIndexesReference(LIST_FILES_DESCRIPTION);
    readFileDescription = withListIndexesReference(READ_FILE_DESCRIPTION);
  } else {
    // Fixed mode: include enum with index list
    const indexListStr = runner.getIndexListString();
    searchDescription = withIndexList(SEARCH_DESCRIPTION, indexListStr);
    listFilesDescription = withIndexList(LIST_FILES_DESCRIPTION, indexListStr);
    readFileDescription = withIndexList(READ_FILE_DESCRIPTION, indexListStr);
  }

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Tool[] = [
      {
        name: "list_indexes",
        description: "List all available indexes with their metadata. Call this to discover what indexes are available before using search, list_files, or read_file tools.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "search",
        description: searchDescription,
        inputSchema: {
          type: "object",
          properties: {
            index_name: {
              type: "string",
              description: "Name of the index to search.",
              ...(config.agentManaged ? {} : { enum: runner.indexes.map(i => i.name) }),
            },
            query: {
              type: "string",
              description: "Natural language description of what you're looking for.",
            },
            maxChars: {
              type: "number",
              description: "Maximum characters in response (optional).",
            },
          },
          required: ["index_name", "query"],
        },
      },
    ];

    // Add index_repo if store supports write operations
    if ('save' in config.store) {
      tools.push({
        name: "index_repo",
        description: "Create or update an index from a repository. This may take 30+ seconds for large repos. The index will be available for search, list_files, and read_file after creation.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Unique name for this index (e.g., 'pytorch', 'my-lib')"
            },
            source_type: {
              type: "string",
              enum: ["github", "gitlab", "bitbucket", "website"],
              description: "Type of source to index"
            },
            owner: {
              type: "string",
              description: "GitHub repository owner (required for github)"
            },
            repo: {
              type: "string",
              description: "Repository name (required for github, bitbucket)"
            },
            project_id: {
              type: "string",
              description: "GitLab project ID or path (required for gitlab)"
            },
            workspace: {
              type: "string",
              description: "BitBucket workspace slug (required for bitbucket)"
            },
            url: {
              type: "string",
              description: "URL to crawl (required for website)"
            },
            ref: {
              type: "string",
              description: "Branch, tag, or commit (default: HEAD)"
            },
          },
          required: ["name", "source_type"],
        },
      });
    }

    // Add delete_index if store supports it
    if ('delete' in config.store) {
      tools.push({
        name: "delete_index",
        description: "Delete an index by name. This removes the index from storage and it will no longer be available for search.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the index to delete",
            },
          },
          required: ["name"],
        },
      });
    }

    // Only advertise file tools if not in search-only mode
    if (!searchOnly) {
      tools.push(
        {
          name: "list_files",
          description: listFilesDescription,
          inputSchema: {
            type: "object",
            properties: {
              index_name: {
                type: "string",
                description: "Name of the index.",
                ...(config.agentManaged ? {} : { enum: runner.indexes.map(i => i.name) }),
              },
              directory: {
                type: "string",
                description: "Directory to list (default: root).",
              },
              pattern: {
                type: "string",
                description: "Glob pattern to filter results (e.g., '*.ts', 'src/*.json').",
              },
              depth: {
                type: "number",
                description: "Maximum depth to recurse (default: 2). Use 1 for immediate children only.",
              },
              showHidden: {
                type: "boolean",
                description: "Include hidden files starting with '.' (default: false).",
              },
            },
            required: ["index_name"],
          },
        },
        {
          name: "read_file",
          description: readFileDescription,
          inputSchema: {
            type: "object",
            properties: {
              index_name: {
                type: "string",
                description: "Name of the index.",
                ...(config.agentManaged ? {} : { enum: runner.indexes.map(i => i.name) }),
              },
              path: {
                type: "string",
                description: "Path to the file to read, relative to the source root.",
              },
              startLine: {
                type: "number",
                description: "First line to read (1-based, inclusive). Default: 1.",
              },
              endLine: {
                type: "number",
                description: "Last line to read (1-based, inclusive). Use -1 for end of file. Default: -1.",
              },
              searchPattern: {
                type: "string",
                description: "Regex pattern to search for. Only matching lines and context will be shown.",
              },
              contextLinesBefore: {
                type: "number",
                description: "Lines of context before each regex match (default: 5).",
              },
              contextLinesAfter: {
                type: "number",
                description: "Lines of context after each regex match (default: 5).",
              },
              includeLineNumbers: {
                type: "boolean",
                description: "Include line numbers in output (default: true).",
              },
            },
            required: ["index_name", "path"],
          },
        }
      );
    }

    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Handle list_indexes separately (no index_name required)
    if (name === "list_indexes") {
      await runner.refreshIndexList();
      const { indexes } = runner;
      if (indexes.length === 0) {
        return {
          content: [{ type: "text", text: "No indexes available. Use index_repo to create one." }],
        };
      }
      const lines = indexes.map((i) =>
        `- ${i.name} (${i.type}://${i.identifier}) - synced ${i.syncedAt}`
      );
      return {
        content: [{ type: "text", text: `Available indexes:\n${lines.join("\n")}` }],
      };
    }

    // Handle delete_index separately (uses 'name' not 'index_name')
    if (name === "delete_index") {
      const indexName = args?.name as string;

      if (!indexName) {
        return { content: [{ type: "text", text: "Error: name is required" }], isError: true };
      }

      // Check if index exists
      if (!runner.indexNames.includes(indexName)) {
        return {
          content: [{ type: "text", text: `Error: Index "${indexName}" not found` }],
          isError: true,
        };
      }

      // Check if store supports delete operations
      if (!('delete' in config.store)) {
        return { content: [{ type: "text", text: "Error: Store does not support delete operations" }], isError: true };
      }

      try {
        // Delete from store
        await (config.store as IndexStore).delete(indexName);

        // Refresh runner state
        await runner.refreshIndexList();
        runner.invalidateClient(indexName);

        return {
          content: [{ type: "text", text: `Deleted index "${indexName}"` }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Error deleting index: ${error}` }], isError: true };
      }
    }

    // Handle index_repo separately (uses 'name' not 'index_name')
    if (name === "index_repo") {
      const indexName = args?.name as string;
      const sourceType = args?.source_type as string;

      if (!indexName) {
        return { content: [{ type: "text", text: "Error: name is required" }], isError: true };
      }
      if (!sourceType) {
        return { content: [{ type: "text", text: "Error: source_type is required" }], isError: true };
      }

      try {
        let source: Source;
        let sourceDesc: string;

        if (sourceType === "github") {
          const owner = args?.owner as string;
          const repo = args?.repo as string;
          if (!owner || !repo) {
            return { content: [{ type: "text", text: "Error: github requires owner and repo" }], isError: true };
          }
          const { GitHubSource } = await import("../sources/github.js");
          source = new GitHubSource({ owner, repo, ref: (args?.ref as string) || "HEAD" });
          sourceDesc = `github://${owner}/${repo}`;
        } else if (sourceType === "gitlab") {
          const projectId = args?.project_id as string;
          if (!projectId) {
            return { content: [{ type: "text", text: "Error: gitlab requires project_id" }], isError: true };
          }
          const { GitLabSource } = await import("../sources/gitlab.js");
          source = new GitLabSource({ projectId, ref: (args?.ref as string) || "HEAD" });
          sourceDesc = `gitlab://${projectId}`;
        } else if (sourceType === "bitbucket") {
          const workspace = args?.workspace as string;
          const repo = args?.repo as string;
          if (!workspace || !repo) {
            return { content: [{ type: "text", text: "Error: bitbucket requires workspace and repo" }], isError: true };
          }
          const { BitBucketSource } = await import("../sources/bitbucket.js");
          source = new BitBucketSource({ workspace, repo, ref: (args?.ref as string) || "HEAD" });
          sourceDesc = `bitbucket://${workspace}/${repo}`;
        } else if (sourceType === "website") {
          const url = args?.url as string;
          if (!url) {
            return { content: [{ type: "text", text: "Error: website requires url" }], isError: true };
          }
          const { WebsiteSource } = await import("../sources/website.js");
          source = new WebsiteSource({ url });
          sourceDesc = `website://${url}`;
        } else {
          return { content: [{ type: "text", text: `Error: Unknown source_type: ${sourceType}` }], isError: true };
        }

        // Run indexer - need IndexStore for this
        const { Indexer } = await import("../core/indexer.js");
        const indexer = new Indexer();

        // Check if store supports write operations
        if (!('save' in config.store)) {
          return { content: [{ type: "text", text: "Error: Store does not support write operations (index_repo requires IndexStore)" }], isError: true };
        }

        const result = await indexer.index(source, config.store as IndexStore, indexName);

        // Refresh runner state
        await runner.refreshIndexList();
        runner.invalidateClient(indexName);

        return {
          content: [{
            type: "text",
            text: `Created index "${indexName}" from ${sourceDesc}\n- Type: ${result.type}\n- Files indexed: ${result.filesIndexed}\n- Duration: ${result.duration}ms`
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Error indexing: ${error}` }], isError: true };
      }
    }

    try {
      const indexName = args?.index_name as string;
      const client = await runner.getClient(indexName);

      switch (name) {
        case "search": {
          const result = await client.search(args?.query as string, {
            maxOutputLength: args?.maxChars as number | undefined,
          });
          return {
            content: [
              { type: "text", text: result.results || "No results found." },
            ],
          };
        }

        case "list_files": {
          if (searchOnly) {
            return {
              content: [{ type: "text", text: "File operations disabled (search-only mode)" }],
              isError: true,
            };
          }
          const listOpts = {
            directory: args?.directory as string | undefined,
            pattern: args?.pattern as string | undefined,
            depth: args?.depth as number | undefined,
            showHidden: args?.showHidden as boolean | undefined,
          };
          const result = await client.listFiles(listOpts);
          const { formatListOutput } = await import("../tools/list-files.js");
          const text = formatListOutput(result, listOpts);
          return {
            content: [{ type: "text", text }],
          };
        }

        case "read_file": {
          if (searchOnly) {
            return {
              content: [{ type: "text", text: "File operations disabled (search-only mode)" }],
              isError: true,
            };
          }
          const result = await client.readFile(args?.path as string, {
            startLine: args?.startLine as number | undefined,
            endLine: args?.endLine as number | undefined,
            searchPattern: args?.searchPattern as string | undefined,
            contextLinesBefore: args?.contextLinesBefore as number | undefined,
            contextLinesAfter: args?.contextLinesAfter as number | undefined,
            includeLineNumbers: args?.includeLineNumbers as boolean | undefined,
          });
          if (result.error) {
            let errorText = `Error: ${result.error}`;
            if (result.suggestions && result.suggestions.length > 0) {
              errorText += `\n\nDid you mean one of these?\n${result.suggestions.map((s) => `  - ${s}`).join("\n")}`;
            }
            return {
              content: [{ type: "text", text: errorText }],
              isError: true,
            };
          }
          return {
            content: [{ type: "text", text: result.contents ?? "" }],
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error}` }],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Run an MCP server with stdio transport.
 *
 * This is the main entry point for running the MCP server.
 * It creates the server and connects it to stdin/stdout for
 * communication with the MCP client.
 *
 * This function does not return until the server is stopped.
 *
 * @param config - Server configuration
 *
 * @example
 * ```typescript
 * // Serve all indexes in the store
 * await runMCPServer({
 *   store: new FilesystemStore(),
 * });
 *
 * // Serve specific indexes only
 * await runMCPServer({
 *   store: new FilesystemStore(),
 *   indexNames: ["react", "docs"],
 * });
 * ```
 */
export async function runMCPServer(config: MCPServerConfig): Promise<void> {
  const server = await createMCPServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

