/**
 * Clients module exports
 */

export { SearchClient, type SearchClientConfig } from "./search-client.js";
export { CLIAgent, type CLIAgentConfig, type Provider } from "./cli-agent.js";
// Re-export from auggie-sdk for convenience
export {
  AugmentLanguageModel,
  resolveAugmentCredentials,
  type AugmentLanguageModelConfig,
  type AugmentCredentials,
} from "@augmentcode/auggie-sdk";
export {
  MultiIndexRunner,
  type MultiIndexRunnerConfig,
  type IndexInfo,
} from "./multi-index-runner.js";
export {
  createMCPServer,
  runMCPServer,
  type MCPServerConfig,
} from "./mcp-server.js";
export {
  createMCPHttpServer,
  runMCPHttpServer,
  type MCPHttpServerConfig,
  type MCPHttpServer,
} from "./mcp-http-server.js";
