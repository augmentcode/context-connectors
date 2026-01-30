# Integration Tests

This directory contains integration tests that require real credentials and make actual API calls.

## Running Tests

| Command | Description |
|---------|-------------|
| `npm test` | Unit tests (vitest) |
| `npm run test:integration` | All integration tests |

## Prerequisites

1. **Build the project first:**
   ```bash
   npm run build
   ```

2. **Augment credentials** (via one of):
   ```bash
   augment login
   ```
   or environment variables:
   ```bash
   export AUGMENT_API_KEY="your-api-key"
   ```

3. **GitHub token** (for CLI test that indexes a repo):
   ```bash
   export GITHUB_TOKEN="your-github-token"
   ```

## Test Files

| File | Description |
|------|-------------|
| `augment-provider.ts` | Tests the Augment provider SDK integration (credentials, model, API calls, tool calling) |
| `cli-agent.ts` | Tests the built `ctxc` CLI binary end-to-end (indexes augmentcode/auggie, then runs agent) |

## Note

Integration tests are **not** run with `npm test` because they require:
- Built project (`npm run build`)
- Valid API credentials (Augment + GitHub)
- Network access to external services
