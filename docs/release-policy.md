# Release Policy

`v0.4.1` is the current public release baseline for `mcp-imagegen-server`.

## Active Release Line

- `main` is the only active development and release branch.
- Release tags are the source of truth for published versions.
- Do not create long-lived platform-specific release branches unless the implementation must truly diverge by operating system.

## Retired Branches

The old platform-specific release branches have been retired after the unified `v0.4.1` release.

Do not recreate or advance `release/macos-*` or `release/windows-*` for normal patch work. Apply cross-platform fixes to `main` and publish a new tag instead.

## Current Version

- `v0.4.1`: current public release baseline
- Future releases continue from `main` and treat `v0.4.1` as version `1`

## Release Checklist

Before tagging a release:

1. Update package and server-reported versions.
2. Run `npm test`.
3. Run a direct library smoke test when upstream API credentials are available.
4. Run the MCP stdio smoke test when upstream API credentials are available.
5. Verify CI passes on Linux, macOS, and Windows.
6. Tag from `main`.
