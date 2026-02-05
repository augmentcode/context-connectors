/**
 * Index command - Index a data source
 */

import { Command } from "commander";
import { Indexer } from "../core/indexer.js";
import { Source } from "../sources/types.js";
import { FilesystemStore } from "../stores/filesystem.js";
import { getS3Config } from "../stores/s3-config.js";
import { buildClientUserAgent } from "../core/utils.js";
import { parseSourceUrl } from "../core/url-parser.js";

// Shared store options
interface StoreOptions {
  index?: string;
  store: string;
  storePath?: string;
}

function addStoreOptions(cmd: Command): Command {
  return cmd
    .option("-i, --index <name>", "Index name (creates named index in indexes/ subdirectory)")
    .option("--store <type>", "Store type: filesystem, s3 (S3 requires CC_S3_* env vars)", "filesystem")
    .option("--store-path <path>", "Store base path (files stored directly here if no --index)");
}

/**
 * Create a store based on options.
 */
async function createStore(options: StoreOptions) {
  if (options.store === "filesystem") {
    return new FilesystemStore({ basePath: options.storePath });
  } else if (options.store === "s3") {
    const s3Config = getS3Config();
    if (!s3Config.bucket) {
      console.error("S3 store requires CC_S3_BUCKET environment variable");
      process.exit(1);
    }
    const { S3Store } = await import("../stores/s3.js");
    return new S3Store(s3Config);
  } else {
    console.error(`Unknown store type: ${options.store}`);
    process.exit(1);
  }
}

async function runIndex(
  source: Source,
  store: Awaited<ReturnType<typeof createStore>>,
  indexKey: string,
  sourceType: string
) {
  console.log(`Indexing ${sourceType} source...`);
  const indexer = new Indexer({
    clientUserAgent: buildClientUserAgent("cli"),
  });
  const result = await indexer.index(source, store, indexKey);

  console.log(`\nIndexing complete!`);
  console.log(`  Type: ${result.type}`);
  console.log(`  Duration: ${result.duration}ms`);
  console.log();
  console.log(`Summary:`);
  console.log(`  Total files: ${result.filesIndexed}`);
  if (result.filesNewOrModified > 0) {
    console.log(`    - New/modified: ${result.filesNewOrModified} (uploaded and indexed)`);
  }
  if (result.filesUnchanged > 0) {
    console.log(`    - Unchanged: ${result.filesUnchanged} (skipped)`);
  }
  if (result.filesRemoved > 0) {
    console.log(`  Files removed: ${result.filesRemoved}`);
  }
}

// GitHub subcommand
const githubCommand = new Command("github")
  .description("Index a GitHub repository")
  .requiredOption("--owner <owner>", "Repository owner")
  .requiredOption("--repo <repo>", "Repository name")
  .option("--ref <ref>", "Branch, tag, or commit", "HEAD");
addStoreOptions(githubCommand);
githubCommand.action(async (options) => {
  try {
    const { GitHubSource } = await import("../sources/github.js");
    const source = new GitHubSource({
      owner: options.owner,
      repo: options.repo,
      ref: options.ref,
    });

    const store = await createStore(options);
    const indexKey = options.index || ".";
    await runIndex(source, store, indexKey, "github");
  } catch (error) {
    console.error("Indexing failed:", error);
    process.exit(1);
  }
});

// GitLab subcommand
const gitlabCommand = new Command("gitlab")
  .description("Index a GitLab project")
  .requiredOption("--project <id>", "Project ID or path (e.g., group/project)")
  .option("--ref <ref>", "Branch, tag, or commit", "HEAD")
  .option("--gitlab-url <url>", "GitLab base URL (for self-hosted)", "https://gitlab.com");
addStoreOptions(gitlabCommand);
gitlabCommand.action(async (options) => {
  try {
    const { GitLabSource } = await import("../sources/gitlab.js");
    const source = new GitLabSource({
      baseUrl: options.gitlabUrl,
      projectId: options.project,
      ref: options.ref,
    });

    const store = await createStore(options);
    const indexKey = options.index || ".";
    await runIndex(source, store, indexKey, "gitlab");
  } catch (error) {
    console.error("Indexing failed:", error);
    process.exit(1);
  }
});

// BitBucket subcommand
const bitbucketCommand = new Command("bitbucket")
  .description("Index a Bitbucket repository")
  .requiredOption("--workspace <slug>", "Workspace slug")
  .requiredOption("--repo <repo>", "Repository name")
  .option("--ref <ref>", "Branch, tag, or commit", "HEAD")
  .option("--bitbucket-url <url>", "Bitbucket base URL (for Server/Data Center)", "https://api.bitbucket.org/2.0");
addStoreOptions(bitbucketCommand);
bitbucketCommand.action(async (options) => {
  try {
    const { BitBucketSource } = await import("../sources/bitbucket.js");
    const source = new BitBucketSource({
      baseUrl: options.bitbucketUrl,
      workspace: options.workspace,
      repo: options.repo,
      ref: options.ref,
    });

    const store = await createStore(options);
    const indexKey = options.index || ".";
    await runIndex(source, store, indexKey, "bitbucket");
  } catch (error) {
    console.error("Indexing failed:", error);
    process.exit(1);
  }
});

// Website subcommand
const websiteCommand = new Command("website")
  .description("Crawl and index a website")
  .requiredOption("--url <url>", "Website URL to crawl")
  .option("--max-depth <n>", "Maximum crawl depth", (v) => parseInt(v, 10), 3)
  .option("--max-pages <n>", "Maximum pages to crawl", (v) => parseInt(v, 10), 100)
  .option("--include <patterns...>", "URL patterns to include (glob)")
  .option("--exclude <patterns...>", "URL patterns to exclude (glob)")
  .option("--save-content <dir>", "[Debug] Save crawled content to directory for inspection");
addStoreOptions(websiteCommand);
websiteCommand.action(async (options) => {
  try {
    const { WebsiteSource } = await import("../sources/website.js");
    const source = new WebsiteSource({
      url: options.url,
      maxDepth: options.maxDepth,
      maxPages: options.maxPages,
      includePaths: options.include,
      excludePaths: options.exclude,
    });

    // Save content locally if requested (this also triggers the crawl)
    if (options.saveContent) {
      const fs = await import("fs/promises");
      const path = await import("path");
      const files = await source.fetchAll();
      const dir = path.resolve(options.saveContent);
      await fs.mkdir(dir, { recursive: true });
      let savedCount = 0;
      for (const file of files) {
        // Sanitize file.path to prevent path traversal attacks:
        // 1. Normalize to resolve any .. segments
        // 2. Ensure the result stays within the target directory
        const safePath = path.normalize(file.path).replace(/^(\.\.[/\\])+/, "");
        const filePath = path.resolve(dir, safePath);
        if (!filePath.startsWith(dir + path.sep) && filePath !== dir) {
          console.warn(`Skipping file with unsafe path: ${file.path}`);
          continue;
        }
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.contents, "utf-8");
        savedCount++;
      }
      console.log(`Saved ${savedCount} files to ${dir}`);
      // Note: source.fetchAll() caches results internally, so subsequent calls
      // in runIndex will reuse the crawled data
    }

    const store = await createStore(options);
    const indexKey = options.index || ".";
    await runIndex(source, store, indexKey, "website");
  } catch (error) {
    console.error("Indexing failed:", error);
    process.exit(1);
  }
});

// URL-based indexing command (auto-detects source type)
const urlCommand = new Command("url")
  .description("Index from URL with auto-detection (used internally when URL is passed directly)")
  .argument("<url>", "URL of the repository or website to index")
  .option("--ref <ref>", "Branch, tag, or commit (overrides URL-detected ref)");
addStoreOptions(urlCommand);
urlCommand.action(async (url: string, options) => {
  try {
    // Parse the URL to determine source type and config
    const parsed = parseSourceUrl(url);
    const indexKey = options.index || parsed.defaultIndexName;

    let source: Source;

    switch (parsed.type) {
      case "github": {
        const { GitHubSource } = await import("../sources/github.js");
        const config = parsed.config as import("../sources/github.js").GitHubSourceConfig;
        source = new GitHubSource({
          ...config,
          ref: options.ref || config.ref,
        });
        break;
      }
      case "gitlab": {
        const { GitLabSource } = await import("../sources/gitlab.js");
        const config = parsed.config as import("../sources/gitlab.js").GitLabSourceConfig;
        source = new GitLabSource({
          ...config,
          ref: options.ref || config.ref,
        });
        break;
      }
      case "bitbucket": {
        const { BitBucketSource } = await import("../sources/bitbucket.js");
        const config = parsed.config as import("../sources/bitbucket.js").BitBucketSourceConfig;
        source = new BitBucketSource({
          ...config,
          ref: options.ref || config.ref,
        });
        break;
      }
      case "website": {
        const { WebsiteSource } = await import("../sources/website.js");
        const config = parsed.config as import("../sources/website.js").WebsiteSourceConfig;
        source = new WebsiteSource(config);
        break;
      }
      default:
        throw new Error(`Unknown source type: ${parsed.type}`);
    }

    const store = await createStore(options);
    await runIndex(source, store, indexKey, parsed.type);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Invalid")) {
      console.error(`Error parsing URL: ${error.message}`);
    } else {
      console.error("Indexing failed:", error);
    }
    process.exit(1);
  }
});

// Main index command
export const indexCommand = new Command("index")
  .usage("<url> [options]\n       ctxc index <source> [options]")
  .description("Index a data source\n\nExamples:\n  ctxc index https://github.com/owner/repo\n  ctxc index https://github.com/owner/repo -i myindex\n  ctxc index github --owner x --repo y")
  .addCommand(urlCommand, { hidden: true })
  .addCommand(githubCommand)
  .addCommand(gitlabCommand)
  .addCommand(bitbucketCommand)
  .addCommand(websiteCommand);

