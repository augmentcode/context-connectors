/**
 * MCP command - Run MCP servers (stdio or HTTP transport)
 */

import { Command } from "commander";
import { FilesystemStore } from "../stores/filesystem.js";
import { runMCPServer } from "../clients/mcp-server.js";
import { parseIndexSpecs } from "../stores/index-spec.js";
import { CompositeStoreReader } from "../stores/composite.js";
import { LayeredStore } from "../stores/index.js";

// stdio subcommand (stdio-based MCP server for local clients like Claude Desktop)
const stdioCommand = new Command("stdio")
  .description("Start MCP server using stdio transport (for Claude Desktop, etc.)")
  .option(
    "-i, --index <specs...>",
    "Index spec(s): name, path:/path, or s3://bucket/key"
  )
  .option("--agent-managed", "Enable dynamic index management (index_repo, delete_index)")
  .option("--search-only", "Disable list_files/read_file tools (search only)")
  .action(async (options) => {
    try {
      const indexSpecs: string[] | undefined = options.index;
      const agentManaged = options.agentManaged || !indexSpecs || indexSpecs.length === 0;

      let store;
      let indexNames: string[] | undefined;

      if (indexSpecs && indexSpecs.length > 0) {
        // Parse index specs
        const specs = parseIndexSpecs(indexSpecs);
        indexNames = specs.map((s) => s.displayName);

        if (agentManaged) {
          // Agent-managed + remote indexes: use LayeredStore
          const remoteStore = await CompositeStoreReader.fromSpecs(specs);
          store = new LayeredStore(new FilesystemStore(), remoteStore);
        } else {
          // Fixed mode: use read-only CompositeStoreReader
          store = await CompositeStoreReader.fromSpecs(specs);
        }
      } else {
        // No --index: use FilesystemStore (agent-managed mode)
        store = new FilesystemStore();
        // Dynamic indexing: server can start with zero indexes
        // Use list_indexes to see available indexes, index_repo to create new ones
        indexNames = undefined;
      }

      // Start MCP server (writes to stdout, reads from stdin)
      // agentManaged: true when no -i flags (dynamic mode), false when -i flags provided (fixed mode)
      await runMCPServer({
        store,
        indexNames,
        searchOnly: options.searchOnly,
        agentManaged,
      });
    } catch (error) {
      // Write errors to stderr (stdout is for MCP protocol)
      console.error("MCP server failed:", error);
      process.exit(1);
    }
  });

// http subcommand (HTTP-based MCP server for remote clients)
const httpCommand = new Command("http")
  .description("Start MCP server using Streamable HTTP transport")
  .option(
    "-i, --index <specs...>",
    "Index spec(s): name, path:/path, or s3://bucket/key"
  )
  .option("--agent-managed", "Enable dynamic index management (index_repo, delete_index)")
  .option("--port <number>", "Port to listen on", "3000")
  .option("--host <host>", "Host to bind to", "localhost")
  .option("--cors <origins>", "CORS origins (comma-separated, or '*' for any)")
  .option("--base-path <path>", "Base path for MCP endpoint", "/mcp")
  .option("--search-only", "Disable list_files/read_file tools (search only)")
  .option(
    "--api-key <key>",
    "API key for authentication (or set MCP_API_KEY env var)"
  )
  .action(async (options) => {
    try {
      const indexSpecs: string[] | undefined = options.index;
      const agentManaged = options.agentManaged || !indexSpecs || indexSpecs.length === 0;

      let store;
      let indexNames: string[] | undefined;

      if (indexSpecs && indexSpecs.length > 0) {
        // Parse index specs
        const specs = parseIndexSpecs(indexSpecs);
        indexNames = specs.map((s) => s.displayName);

        if (agentManaged) {
          // Agent-managed + remote indexes: use LayeredStore
          const remoteStore = await CompositeStoreReader.fromSpecs(specs);
          store = new LayeredStore(new FilesystemStore(), remoteStore);
        } else {
          // Fixed mode: use read-only CompositeStoreReader
          store = await CompositeStoreReader.fromSpecs(specs);
        }
      } else {
        // No --index: use FilesystemStore (agent-managed mode)
        store = new FilesystemStore();
        // Dynamic indexing: server can start with zero indexes
        // Use list_indexes to see available indexes, index_repo to create new ones
        indexNames = undefined;
      }

      // Parse CORS option
      let cors: string | string[] | undefined;
      if (options.cors) {
        cors =
          options.cors === "*"
            ? "*"
            : options.cors.split(",").map((s: string) => s.trim());
      }

      // Get API key from option or environment
      const apiKey = options.apiKey ?? process.env.MCP_API_KEY;

      // Start HTTP server
      // agentManaged: true when no -i flags (dynamic mode), false when -i flags provided (fixed mode)
      const { runMCPHttpServer } = await import("../clients/mcp-http-server.js");
      const server = await runMCPHttpServer({
        store,
        indexNames,
        searchOnly: options.searchOnly,
        agentManaged,
        port: parseInt(options.port, 10),
        host: options.host,
        cors,
        basePath: options.basePath,
        apiKey,
      });

      console.log(`MCP HTTP server listening at ${server.getUrl()}`);
      console.log(`Connect with MCP clients using Streamable HTTP transport`);
      if (apiKey) {
        console.log(`Authentication: API key required (Authorization: Bearer <key>)`);
      } else {
        console.log(`Authentication: None (open access)`);
      }

      // Security warnings for non-localhost bindings
      const host = options.host;
      const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
      if (!isLocalhost) {
        console.log();
        console.log("⚠️  SECURITY WARNING: Server is binding to a non-localhost interface.");
        console.log("   This server uses HTTP (not HTTPS) - all traffic is unencrypted.");
        if (apiKey) {
          console.log("   API keys will be transmitted in cleartext over the network.");
        }
        console.log();
        console.log("   For production deployments, use one of these approaches:");
        console.log("   • Place behind a TLS-terminating reverse proxy (nginx, Caddy, etc.)");
        console.log("   • Use within a private network or VPN");
        console.log("   • Bind to localhost and use SSH tunneling for remote access");
        console.log();
      }

      // Handle shutdown
      const shutdown = async () => {
        console.log("\nShutting down...");
        await server.stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    } catch (error) {
      console.error("Failed to start MCP HTTP server:", error);
      process.exit(1);
    }
  });

// Main mcp command
export const mcpCommand = new Command("mcp")
  .description("Run MCP servers (stdio or http transport)")
  .addCommand(stdioCommand)
  .addCommand(httpCommand);
