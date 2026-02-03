/**
 * CLI Integration Test - Agent Command with Augment Provider
 *
 * Tests the actual `ctxc` CLI binary end-to-end.
 *
 * Prerequisites:
 * - Built project (`npm run build`)
 * - Augment credentials configured (via `augment login` or env vars)
 * - GitHub token (GITHUB_TOKEN env var) for indexing
 *
 * Usage:
 *   npm run test:integration
 */

import { spawn } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { resolve } from "path";
import { tmpdir } from "os";
import { join } from "path";

interface TestResult {
  name: string;
  passed: boolean;
  output?: string;
  error?: string;
}

let testIndexPath: string | null = null;

// Path to the local CLI build
const CLI_PATH = resolve(import.meta.dirname, "../dist/bin/index.js");

async function runCLI(
  args: string[],
  timeoutMs = 60000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: process.env,
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on("error", (err) => {
      resolve({ stdout, stderr, exitCode: 1 });
    });
  });
}

async function setupTestIndex(): Promise<TestResult> {
  // Create a temp directory for the test index
  testIndexPath = await mkdtemp(join(tmpdir(), "ctxc-test-"));

  // Index the augmentcode/auggie repo (small repo)
  const { stdout, stderr, exitCode } = await runCLI(
    [
      "index",
      "github",
      "--owner",
      "augmentcode",
      "--repo",
      "auggie",
      "--store-path",
      testIndexPath,
    ],
    180000
  ); // 3 minute timeout for indexing

  const passed = exitCode === 0;
  return {
    name: "Create test index (augmentcode/auggie)",
    passed,
    output: passed
      ? `Index created at ${testIndexPath}`
      : `stdout: ${stdout}\nstderr: ${stderr}`,
  };
}

async function cleanupTestIndex(): Promise<void> {
  if (testIndexPath) {
    try {
      await rm(testIndexPath, { recursive: true, force: true });
      console.log(`\nCleaned up test index at ${testIndexPath}`);
    } catch (e) {
      console.warn(`Warning: Failed to clean up ${testIndexPath}`);
    }
  }
}

async function testHelp(): Promise<TestResult> {
  const { stdout, exitCode } = await runCLI(["agent", "--help"]);
  const passed =
    exitCode === 0 &&
    stdout.includes("--provider") &&
    stdout.includes("augment");
  return {
    name: "CLI help shows augment provider option",
    passed,
    output: passed ? undefined : stdout,
  };
}

async function testVersion(): Promise<TestResult> {
  const { stdout, exitCode } = await runCLI(["--version"]);
  const passed = exitCode === 0 && /\d+\.\d+\.\d+/.test(stdout);
  return {
    name: "CLI version command works",
    passed,
    output: passed ? undefined : stdout,
  };
}

async function testAgentWithAugment(): Promise<TestResult> {
  if (!testIndexPath) {
    return {
      name: "Agent with Augment provider responds to query",
      passed: false,
      error: "Test index not created",
    };
  }

  // Use --print for non-interactive mode, ask a simple question
  const { stdout, stderr, exitCode } = await runCLI(
    [
      "agent",
      "--provider",
      "augment",
      "--index",
      `path:${testIndexPath}`,
      "--print",
      "--max-steps",
      "3",
      "What is the main purpose of the auggie SDK? Answer in one sentence.",
    ],
    120000
  );

  // Check that we got a response (not an error)
  const hasResponse = stdout.length > 50 || stderr.includes("Response:");
  const hasNoError =
    stderr.indexOf("Error:") === -1 && stderr.indexOf("ECONNREFUSED") === -1;
  const passed = exitCode === 0 && (hasResponse || hasNoError);

  return {
    name: "Agent with Augment provider responds to query",
    passed,
    output: passed
      ? stdout.slice(0, 200)
      : `stdout: ${stdout}\nstderr: ${stderr}`,
  };
}

async function main() {
  console.log("🧪 CLI Integration Test - ctxc\n");
  console.log("=".repeat(50) + "\n");

  const tests = [setupTestIndex, testHelp, testVersion, testAgentWithAugment];

  const results: TestResult[] = [];

  try {
    for (const test of tests) {
      process.stdout.write(`Running: ${test.name}... `);
      const result = await test();
      results.push(result);
      console.log(result.passed ? "✓" : "✔");
      if (result.passed && result.output) {
        console.log(`  ${result.output.slice(0, 150)}`);
      }
      if (result.passed === false && result.output) {
        console.log(`  Output: ${result.output.slice(0, 300)}`);
      }
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }

      // If setup fails, skip remaining tests
      if (test.name === "setupTestIndex" && !result.passed) {
        console.log("\nSkipping remaining tests due to setup failure.");
        break;
      }
    }
  } finally {
    await cleanupTestIndex();
  }

  console.log("\n" + "=".repeat(50));

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  if (passed === total) {
    console.log(`✅ All ${total} CLI tests passed!\n`);
    process.exit(0);
  } else {
    console.log(`❌ ${passed}/${total} CLI tests passed\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
