import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  detectClientEnvironment,
  installClientIntegration,
  resolveServerEntryPathFromFileUrl,
  upsertCodexServerBlock
} from "../lib/setup.mjs";

test("detectClientEnvironment prefers Codex when CODEX_HOME is present", async () => {
  const detected = await detectClientEnvironment({
    env: {
      HOME: "/Users/example",
      CODEX_HOME: "/Users/example/.codex"
    },
    cwd: "/Users/example/project",
    pathExists: async () => false,
    hasCommand: async () => false
  });

  assert.equal(detected.id, "codex");
  assert.equal(detected.source, "env");
});

test("detectClientEnvironment detects Claude Code from a typed project .mcp.json", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-setup-"));
  const projectRoot = path.join(tempRoot, "project");
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, ".mcp.json"),
    `${JSON.stringify({ mcpServers: { imagegen: { type: "stdio", command: "node", args: ["server.mjs"] } } }, null, 2)}\n`,
    "utf8"
  );

  const detected = await detectClientEnvironment({
    env: {
      HOME: tempRoot
    },
    cwd: projectRoot,
    hasCommand: async () => false
  });

  assert.equal(detected.id, "claudecode");
  assert.equal(detected.source, "project-config");
});

test("detectClientEnvironment treats an untyped project .mcp.json as generic", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-setup-"));
  const projectRoot = path.join(tempRoot, "project");
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, ".mcp.json"),
    `${JSON.stringify({ mcpServers: { imagegen: { command: "node", args: ["server.mjs"] } } }, null, 2)}\n`,
    "utf8"
  );

  const detected = await detectClientEnvironment({
    env: {
      HOME: tempRoot
    },
    cwd: projectRoot,
    hasCommand: async () => false
  });

  assert.equal(detected.id, "generic");
  assert.equal(detected.source, "project-config");
});

test("detectClientEnvironment prefers a project config over a global Codex config file", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-setup-"));
  const projectRoot = path.join(tempRoot, "project");
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.mkdir(path.join(tempRoot, ".codex"), { recursive: true });
  await fs.writeFile(path.join(tempRoot, ".codex", "config.toml"), "", "utf8");
  await fs.writeFile(path.join(projectRoot, ".mcp.json"), `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`, "utf8");

  const detected = await detectClientEnvironment({
    env: {
      HOME: tempRoot
    },
    cwd: projectRoot,
    hasCommand: async () => false
  });

  assert.equal(detected.id, "generic");
  assert.equal(detected.source, "project-config");
});

test("detectClientEnvironment falls back to generic when multiple client commands are available", async () => {
  const detected = await detectClientEnvironment({
    env: {
      HOME: "/Users/example"
    },
    cwd: "/Users/example/project",
    pathExists: async () => false,
    hasCommand: async (name) => name === "codex" || name === "claude"
  });

  assert.equal(detected.id, "generic");
  assert.equal(detected.source, "ambiguous");
});

test("detectClientEnvironment falls back to generic when no supported client is detected", async () => {
  const detected = await detectClientEnvironment({
    env: {
      HOME: "/Users/example"
    },
    cwd: "/Users/example/project",
    pathExists: async () => false,
    hasCommand: async () => false
  });

  assert.equal(detected.id, "generic");
  assert.equal(detected.source, "fallback");
});

test("upsertCodexServerBlock appends a managed imagegen server block", () => {
  const updated = upsertCodexServerBlock({
    originalText: 'model = "gpt-5.4"\n',
    serverName: "imagegen",
    command: "node",
    args: ["/opt/imagegen/server.mjs"]
  });

  assert.match(updated, /model = "gpt-5\.4"/);
  assert.match(updated, /\[mcp_servers\.imagegen\]/);
  assert.match(updated, /command = "node"/);
  assert.match(updated, /args = \["\/opt\/imagegen\/server\.mjs"\]/);
});

test("installClientIntegration writes Claude Code project config automatically", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-setup-"));
  const projectRoot = path.join(tempRoot, "project");
  await fs.mkdir(projectRoot, { recursive: true });

  const result = await installClientIntegration({
    detection: {
      id: "claudecode",
      label: "Claude Code"
    },
    cwd: projectRoot,
    env: {
      HOME: tempRoot
    },
    serverName: "imagegen",
    command: "node",
    args: ["/opt/imagegen/server.mjs"]
  });

  const saved = JSON.parse(await fs.readFile(path.join(projectRoot, ".mcp.json"), "utf8"));

  assert.equal(result.configPath, path.join(projectRoot, ".mcp.json"));
  assert.deepEqual(saved, {
    mcpServers: {
      imagegen: {
        type: "stdio",
        command: "node",
        args: ["/opt/imagegen/server.mjs"]
      }
    }
  });
});

test("installClientIntegration reads and updates a BOM-prefixed JSON config", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-setup-"));
  const projectRoot = path.join(tempRoot, "project");
  const configPath = path.join(projectRoot, ".mcp.json");
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    configPath,
    Buffer.from(
      `\uFEFF${JSON.stringify({ mcpServers: { existing: { command: "node", args: ["existing.mjs"] } } }, null, 2)}\n`,
      "utf8"
    )
  );

  await installClientIntegration({
    detection: {
      id: "claudecode",
      label: "Claude Code",
      configPath
    },
    cwd: projectRoot,
    env: {
      HOME: tempRoot
    },
    serverName: "imagegen",
    command: "node",
    args: ["/opt/imagegen/server.mjs"]
  });

  const bytes = await fs.readFile(configPath);
  const saved = JSON.parse(bytes.toString("utf8"));

  assert.notDeepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.deepEqual(saved.mcpServers.existing, {
    command: "node",
    args: ["existing.mjs"]
  });
  assert.deepEqual(saved.mcpServers.imagegen, {
    type: "stdio",
    command: "node",
    args: ["/opt/imagegen/server.mjs"]
  });
});

test("installClientIntegration writes Codex config automatically", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-imagegen-setup-"));

  const result = await installClientIntegration({
    detection: {
      id: "codex",
      label: "Codex"
    },
    cwd: path.join(tempRoot, "project"),
    env: {
      HOME: tempRoot
    },
    serverName: "imagegen",
    command: "node",
    args: ["/opt/imagegen/server.mjs"]
  });

  const configPath = path.join(tempRoot, ".codex", "config.toml");
  const saved = await fs.readFile(configPath, "utf8");

  assert.equal(result.configPath, configPath);
  assert.match(saved, /\[mcp_servers\.imagegen\]/);
  assert.match(saved, /command = "node"/);
});

test("resolveServerEntryPathFromFileUrl returns a native Windows path", () => {
  const result = resolveServerEntryPathFromFileUrl("file:///C:/Users/example/API-gpt-image-2-mcp/server.mjs", "win32");

  assert.equal(result, "C:\\Users\\example\\API-gpt-image-2-mcp\\server.mjs");
});
