#!/usr/bin/env node
/**
 * CLI entry point for context-connectors
 */

import { Command } from "commander";
import { createRequire } from "module";
import { indexCommand } from "./cmd-index.js";
import { searchCommand } from "./cmd-search.js";
import { mcpCommand } from "./cmd-mcp.js";
import { listCommand, deleteCommand } from "./cmd-local.js";
import { agentCommand } from "./cmd-agent.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json");

const program = new Command();

program
  .name("context-connectors")
  .description("Index and search any data source with Augment's context engine")
  .version(packageJson.version);

// Add subcommands
program.addCommand(indexCommand);
program.addCommand(listCommand);
program.addCommand(deleteCommand);
program.addCommand(searchCommand);
program.addCommand(mcpCommand);
program.addCommand(agentCommand);

program.parse();

