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
  .name("ctxc")
  .description("Index and search any data source with Augment's context engine")
  .version(packageJson.version);

// Add subcommands
program.addCommand(indexCommand);
program.addCommand(listCommand);
program.addCommand(deleteCommand);
program.addCommand(searchCommand);
program.addCommand(mcpCommand);
program.addCommand(agentCommand);

// Auto-detect URL mode: ctxc index <url> -> ctxc index url <url>
// Scan for URL anywhere after 'index' to support: ctxc index -i name https://...
const indexIdx = process.argv.indexOf("index");
if (indexIdx !== -1) {
  const subcommands = ["url", "github", "gitlab", "bitbucket", "website"];
  // Find first URL-like argument after 'index'
  for (let i = indexIdx + 1; i < process.argv.length; i++) {
    const arg = process.argv[i];
    // Stop if we hit a known subcommand
    if (subcommands.includes(arg)) break;
    // Found a URL - reorder args to put 'url' and the URL right after 'index'
    if (arg.match(/^https?:\/\//)) {
      // Remove the URL from its current position
      process.argv.splice(i, 1);
      // Insert 'url' <url> right after 'index'
      process.argv.splice(indexIdx + 1, 0, "url", arg);
      break;
    }
  }
}

program.parse();
