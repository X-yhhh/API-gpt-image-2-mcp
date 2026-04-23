# Release Policy

`v0.4.1` is the first unified cross-platform release baseline for `mcp-imagegen-server`.

## Active Release Line

- `main` is the only active development and release branch.
- Release tags are the source of truth for published versions.
- Do not create long-lived platform-specific release branches unless the implementation must truly diverge by operating system.

## Historical Branches

These branches are retained as read-only references for older releases:

- `release/macos-v0.3.0`: macOS / Unix-focused historical line
- `release/windows-v0.4.0`: Windows-support historical line

Do not advance these branches for normal patch work. Apply cross-platform fixes to `main` and publish a new tag instead.

## Version History

- `v0.3.0`: macOS / Unix-focused historical release line
- `v0.4.0`: first release line with Windows local-path support
- `v0.4.1`: first unified cross-platform release baseline

## Release Checklist

Before tagging a release:

1. Update package and server-reported versions.
2. Run `npm test`.
3. Run a direct library smoke test when upstream API credentials are available.
4. Run the MCP stdio smoke test when upstream API credentials are available.
5. Verify CI passes on Linux, macOS, and Windows.
6. Tag from `main`.
