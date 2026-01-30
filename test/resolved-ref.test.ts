/**
 * Integration tests for resolvedRef handling in GitHubSource.
 *
 * These tests verify that when a specific commit SHA is provided as ref,
 * the listFiles and readFile operations use that exact commit, not the
 * latest commit on a branch.
 *
 * This validates the fix in createSourceFromState() that ensures file
 * operations use resolvedRef (the indexed commit SHA) instead of config.ref
 * (the branch name).
 *
 * Prerequisites:
 * - GITHUB_TOKEN environment variable set
 *
 * Usage:
 *   npx tsx test/resolved-ref.test.ts
 */

import { GitHubSource } from "../src/sources/github.js";

// Skip if no GitHub token
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.log("⏭️  Skipping: GITHUB_TOKEN not set");
  process.exit(0);
}

// Known commits from octocat/Hello-World repository
// These are stable and won't change
const OLDEST_COMMIT = "553c2077f0edc3d5dc5d17262f6aa498e69d6f8e";
const NEWEST_COMMIT = "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d";

// Expected content at specific commits (base64 decoded):
// OLDEST_COMMIT README: "Hello World!" (no trailing newline)
// NEWEST_COMMIT README: "Hello World!\n" (with trailing newline)
const OLDEST_COMMIT_README_CONTENT = "Hello World!";
const NEWEST_COMMIT_README_CONTENT = "Hello World!\n";

interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

const results: TestResult[] = [];

function test(name: string, passed: boolean, message?: string) {
  results.push({ name, passed, message });
  console.log(`${passed ? "✓" : "✗"} ${name}`);
  if (message && !passed) {
    console.log(`  ${message}`);
  }
}

async function testListFilesHonorsRef() {
  console.log("\n📁 Testing listFiles honors ref...\n");

  // Test 1: listFiles with oldest commit should work
  try {
    const source = new GitHubSource({
      owner: "octocat",
      repo: "Hello-World",
      ref: OLDEST_COMMIT,
      token: GITHUB_TOKEN,
    });

    const files = await source.listFiles();
    const hasReadme = files.some((f) => f.path === "README");

    test(
      "listFiles with commit SHA returns files",
      files.length > 0 && hasReadme,
      `Expected README in files, got: ${JSON.stringify(files.map((f) => f.path))}`
    );
  } catch (error) {
    test("listFiles with commit SHA returns files", false, String(error));
  }

  // Test 2: listFiles with newest commit should also work
  try {
    const source = new GitHubSource({
      owner: "octocat",
      repo: "Hello-World",
      ref: NEWEST_COMMIT,
      token: GITHUB_TOKEN,
    });

    const files = await source.listFiles();
    const hasReadme = files.some((f) => f.path === "README");

    test(
      "listFiles with different commit SHA also works",
      files.length > 0 && hasReadme,
      `Expected README in files, got: ${JSON.stringify(files.map((f) => f.path))}`
    );
  } catch (error) {
    test("listFiles with different commit SHA also works", false, String(error));
  }
}

async function testReadFileHonorsRef() {
  console.log("\n📄 Testing readFile honors ref...\n");

  // Test 1: readFile at oldest commit returns content from that commit
  try {
    const source = new GitHubSource({
      owner: "octocat",
      repo: "Hello-World",
      ref: OLDEST_COMMIT,
      token: GITHUB_TOKEN,
    });

    const content = await source.readFile("README");
    const matches = content === OLDEST_COMMIT_README_CONTENT;

    test(
      "readFile at oldest commit returns correct content",
      matches,
      `Expected "${OLDEST_COMMIT_README_CONTENT}", got "${content}"`
    );
  } catch (error) {
    test("readFile at oldest commit returns correct content", false, String(error));
  }

  // Test 2: readFile at newest commit returns different content
  try {
    const source = new GitHubSource({
      owner: "octocat",
      repo: "Hello-World",
      ref: NEWEST_COMMIT,
      token: GITHUB_TOKEN,
    });

    const content = await source.readFile("README");
    const matches = content === NEWEST_COMMIT_README_CONTENT;

    test(
      "readFile at newest commit returns correct content",
      matches,
      `Expected "${NEWEST_COMMIT_README_CONTENT}", got "${content}"`
    );
  } catch (error) {
    test("readFile at newest commit returns correct content", false, String(error));
  }

  // Test 3: Two sources with different refs return different content
  try {
    const oldSource = new GitHubSource({
      owner: "octocat",
      repo: "Hello-World",
      ref: OLDEST_COMMIT,
      token: GITHUB_TOKEN,
    });

    const newSource = new GitHubSource({
      owner: "octocat",
      repo: "Hello-World",
      ref: NEWEST_COMMIT,
      token: GITHUB_TOKEN,
    });

    const oldContent = await oldSource.readFile("README");
    const newContent = await newSource.readFile("README");

    const contentsDiffer = oldContent !== newContent;

    test(
      "Different commit SHAs return different file content",
      contentsDiffer,
      `Expected different content, both returned: "${oldContent}"`
    );
  } catch (error) {
    test("Different commit SHAs return different file content", false, String(error));
  }
}

async function testMetadataResolvedRef() {
  console.log("\n📋 Testing metadata resolvedRef...\n");

  // Test: getMetadata returns the exact commit SHA as resolvedRef
  try {
    const source = new GitHubSource({
      owner: "octocat",
      repo: "Hello-World",
      ref: OLDEST_COMMIT,
      token: GITHUB_TOKEN,
    });

    const metadata = await source.getMetadata();

    test(
      "getMetadata returns correct resolvedRef",
      metadata.type === "github" && metadata.resolvedRef === OLDEST_COMMIT,
      `Expected resolvedRef=${OLDEST_COMMIT}, got ${metadata.type === "github" ? metadata.resolvedRef : "non-github type"}`
    );

    // Also verify config.ref is preserved separately
    test(
      "getMetadata preserves config.ref",
      metadata.type === "github" && metadata.config.ref === OLDEST_COMMIT,
      `Expected config.ref=${OLDEST_COMMIT}, got ${metadata.type === "github" ? metadata.config.ref : "non-github type"}`
    );
  } catch (error) {
    test("getMetadata returns correct resolvedRef", false, String(error));
  }
}

async function main() {
  console.log("🧪 Resolved Ref Integration Tests\n");
  console.log("=".repeat(50));
  console.log("\nThese tests verify that GitHubSource operations use the");
  console.log("exact commit SHA provided as ref, ensuring file operations");
  console.log("return content from the indexed commit, not the latest.\n");

  await testListFilesHonorsRef();
  await testReadFileHonorsRef();
  await testMetadataResolvedRef();

  // Summary
  console.log("\n" + "=".repeat(50));
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  if (passed === total) {
    console.log(`\n✅ All ${total} tests passed!`);
    process.exit(0);
  } else {
    console.log(`\n❌ ${passed}/${total} tests passed`);
    const failed = results.filter((r) => !r.passed);
    console.log("\nFailed tests:");
    for (const f of failed) {
      console.log(`  - ${f.name}: ${f.message}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});
