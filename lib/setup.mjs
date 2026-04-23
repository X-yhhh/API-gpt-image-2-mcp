import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

import { DEFAULT_MODEL, writeRuntimeConfigFile } from "./runtime-config.mjs";

const SERVER_NAME = "imagegen";

function getPathModule(platform = process.platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

function resolveHomeDirectory(env = process.env) {
  return (
    env.HOME ||
    env.USERPROFILE ||
    (env.HOMEDRIVE && env.HOMEPATH ? `${env.HOMEDRIVE}${env.HOMEPATH}` : undefined) ||
    os.homedir()
  );
}

async function defaultPathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function defaultHasCommand(command, { env = process.env, platform = process.platform } = {}) {
  const pathModule = getPathModule(platform);
  const pathValue = env.PATH || "";
  const extensions = platform === "win32" ? (env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];

  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = pathModule.join(directory, `${command}${extension}`);

      if (await defaultPathExists(candidate)) {
        return true;
      }
    }
  }

  return false;
}

function quoteToml(value) {
  return JSON.stringify(value);
}

function formatTomlArray(values = []) {
  return `[${values.map((value) => quoteToml(value)).join(", ")}]`;
}

function buildCodexServerBlock({ serverName = SERVER_NAME, command, args = [], cwd, env }) {
  const lines = [`[mcp_servers.${serverName}]`, `command = ${quoteToml(command)}`];

  if (args.length > 0) {
    lines.push(`args = ${formatTomlArray(args)}`);
  }

  if (cwd) {
    lines.push(`cwd = ${quoteToml(cwd)}`);
  }

  if (env && Object.keys(env).length > 0) {
    const entries = Object.entries(env).map(([key, value]) => `${key} = ${quoteToml(value)}`);
    lines.push(`env = { ${entries.join(", ")} }`);
  }

  return lines.join("\n");
}

function upsertJsonServer({ existing, serverName, value, rootKey = "mcpServers" }) {
  const next = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  next[rootKey] = next[rootKey] && typeof next[rootKey] === "object" && !Array.isArray(next[rootKey]) ? next[rootKey] : {};
  next[rootKey][serverName] = value;
  return next;
}

function stripUtf8Bom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(stripUtf8Bom(await fs.readFile(filePath, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
}

function classifyMcpJsonConfig(config) {
  const servers =
    config?.mcpServers && typeof config.mcpServers === "object" && !Array.isArray(config.mcpServers) ? config.mcpServers : null;

  if (!servers) {
    return "generic";
  }

  return Object.values(servers).some(
    (entry) => entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.type === "string"
  )
    ? "claudecode"
    : "generic";
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  const unique = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      continue;
    }

    seen.add(candidate.id);
    unique.push(candidate);
  }

  return unique;
}

export function resolveServerEntryPathFromFileUrl(fileUrl, platform = process.platform) {
  return fileURLToPath(fileUrl, { windows: platform === "win32" });
}

export function upsertCodexServerBlock({
  originalText = "",
  serverName = SERVER_NAME,
  command,
  args = [],
  cwd,
  env
}) {
  const block = buildCodexServerBlock({ serverName, command, args, cwd, env });
  const pattern = new RegExp(`\\n?\\[mcp_servers\\.${serverName}\\][\\s\\S]*?(?=\\n\\[[^\\n]+\\]|\\s*$)`, "m");
  const trimmedOriginal = originalText.trimEnd();

  if (pattern.test(trimmedOriginal)) {
    return `${trimmedOriginal.replace(pattern, `\n${block}`).trimStart()}\n`;
  }

  return `${trimmedOriginal}${trimmedOriginal ? "\n\n" : ""}${block}\n`;
}

function resolveCodexConfigPath({ env = process.env, platform = process.platform }) {
  const pathModule = getPathModule(platform);
  const codexHome = env.CODEX_HOME || pathModule.join(resolveHomeDirectory(env), ".codex");
  return pathModule.join(codexHome, "config.toml");
}

function resolveOpenCodeConfigPath({ env = process.env, cwd = process.cwd(), platform = process.platform }) {
  const pathModule = getPathModule(platform);
  return env.OPENCODE_CONFIG || pathModule.join(cwd, "opencode.json");
}

function resolveOpenClawConfigPath({ env = process.env, cwd = process.cwd(), platform = process.platform }) {
  const pathModule = getPathModule(platform);
  return env.OPENCLAW_CONFIG || pathModule.join(cwd, "openclaw.json");
}

export async function detectClientEnvironment({
  env = process.env,
  cwd = process.cwd(),
  platform = process.platform,
  pathExists = defaultPathExists,
  hasCommand = (command) => defaultHasCommand(command, { env, platform })
} = {}) {
  const pathModule = getPathModule(platform);
  const codexConfigPath = resolveCodexConfigPath({ env, platform });
  const claudeProjectConfigPath = pathModule.join(cwd, ".mcp.json");
  const openCodeConfigPath = resolveOpenCodeConfigPath({ env, cwd, platform });
  const openClawConfigPath = resolveOpenClawConfigPath({ env, cwd, platform });

  if (env.CODEX_HOME || env.CODEX_SESSION_ID || env.CODEX_SANDBOX) {
    return { id: "codex", label: "Codex", source: "env", configPath: codexConfigPath };
  }

  if (await pathExists(claudeProjectConfigPath)) {
    const existing = await readJsonIfExists(claudeProjectConfigPath);
    const detectedId = classifyMcpJsonConfig(existing);
    return {
      id: detectedId,
      label: detectedId === "claudecode" ? "Claude Code" : "Generic MCP Client",
      source: "project-config",
      configPath: claudeProjectConfigPath
    };
  }

  if (await pathExists(openCodeConfigPath)) {
    return { id: "opencode", label: "OpenCode", source: "project-config", configPath: openCodeConfigPath };
  }

  if (await pathExists(openClawConfigPath)) {
    return { id: "openclaw", label: "OpenClaw", source: "project-config", configPath: openClawConfigPath };
  }

  const candidates = [];

  if (await pathExists(codexConfigPath)) {
    candidates.push({ id: "codex", label: "Codex", source: "config", configPath: codexConfigPath });
  }

  if (await hasCommand("codex")) {
    candidates.push({ id: "codex", label: "Codex", source: "command", configPath: codexConfigPath });
  }

  if (await hasCommand("claude")) {
    candidates.push({ id: "claudecode", label: "Claude Code", source: "command", configPath: claudeProjectConfigPath });
  }

  if (await hasCommand("opencode")) {
    candidates.push({ id: "opencode", label: "OpenCode", source: "command", configPath: openCodeConfigPath });
  }

  if (await hasCommand("openclaw")) {
    candidates.push({ id: "openclaw", label: "OpenClaw", source: "command", configPath: openClawConfigPath });
  }

  const unique = uniqueCandidates(candidates);

  if (unique.length === 1) {
    return unique[0];
  }

  if (unique.length > 1) {
    return {
      id: "generic",
      label: "Generic MCP Client",
      source: "ambiguous",
      configPath: pathModule.join(cwd, ".mcp.json")
    };
  }

  return {
    id: "generic",
    label: "Generic MCP Client",
    source: "fallback",
    configPath: pathModule.join(cwd, ".mcp.json")
  };
}

export async function installClientIntegration({
  detection,
  cwd = process.cwd(),
  env = process.env,
  platform = process.platform,
  serverName = SERVER_NAME,
  command = process.execPath,
  args = [path.resolve("server.mjs")]
} = {}) {
  const pathModule = getPathModule(platform);
  const shared = { command, args };

  switch (detection.id) {
    case "codex": {
      const configPath = detection.configPath || resolveCodexConfigPath({ env, platform });
      let originalText = "";

      try {
        originalText = await fs.readFile(configPath, "utf8");
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      }

      const nextText = upsertCodexServerBlock({ originalText, serverName, command, args });
      await fs.mkdir(pathModule.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, Buffer.from(nextText, "utf8"));
      return { client: detection.label, clientId: detection.id, configPath };
    }
    case "opencode": {
      const configPath = detection.configPath || resolveOpenCodeConfigPath({ env, cwd, platform });
      const existing = await readJsonIfExists(configPath);
      const next = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
      next.mcp = next.mcp && typeof next.mcp === "object" && !Array.isArray(next.mcp) ? next.mcp : {};
      next.mcp[serverName] = {
        type: "local",
        command: [command, ...args]
      };
      await writeJsonFile(configPath, next);
      return { client: detection.label, clientId: detection.id, configPath };
    }
    case "openclaw": {
      const configPath = detection.configPath || resolveOpenClawConfigPath({ env, cwd, platform });
      const existing = await readJsonIfExists(configPath);
      const next = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
      next.mcp = next.mcp && typeof next.mcp === "object" && !Array.isArray(next.mcp) ? next.mcp : {};
      next.mcp.servers =
        next.mcp.servers && typeof next.mcp.servers === "object" && !Array.isArray(next.mcp.servers)
          ? next.mcp.servers
          : {};
      next.mcp.servers[serverName] = shared;
      await writeJsonFile(configPath, next);
      return { client: detection.label, clientId: detection.id, configPath };
    }
    case "claudecode":
    case "generic":
    default: {
      const configPath = detection.configPath || pathModule.join(cwd, ".mcp.json");
      const existing = await readJsonIfExists(configPath);
      const next = upsertJsonServer({
        existing,
        serverName,
        value: {
          ...(detection.id === "claudecode" ? { type: "stdio" } : {}),
          ...shared
        }
      });
      await writeJsonFile(configPath, next);
      return { client: detection.label, clientId: detection.id, configPath };
    }
  }
}

async function promptForRuntimeConfig({ rl }) {
  const baseUrl = (await rl.question("Base URL: ")).trim();
  const apiKey = (await rl.question("API Key: ")).trim();
  const modelInput = (await rl.question(`Model (${DEFAULT_MODEL}): `)).trim();

  return {
    baseUrl,
    apiKey,
    model: modelInput || DEFAULT_MODEL
  };
}

export async function runConfigure({
  env = process.env,
  cwd = process.cwd(),
  platform = process.platform,
  command = process.execPath,
  serverEntryPath = path.resolve("server.mjs"),
  runtimeConfig,
  prompt = true,
  out = console
} = {}) {
  let config = runtimeConfig;

  if (!config && prompt) {
    const rl = readline.createInterface({ input, output });

    try {
      config = await promptForRuntimeConfig({ rl });
    } finally {
      rl.close();
    }
  }

  if (!config) {
    throw new Error("Runtime config is required.");
  }

  const runtimeResult = await writeRuntimeConfigFile({ env, config, platform });
  const detection = await detectClientEnvironment({ env, cwd, platform });
  const clientResult = await installClientIntegration({
    detection,
    cwd,
    env,
    platform,
    command,
    args: [serverEntryPath]
  });

  out.log(`Runtime config saved: ${runtimeResult.configPath}`);
  out.log(`MCP client configured: ${clientResult.client} (${clientResult.configPath})`);

  return {
    runtimeConfigPath: runtimeResult.configPath,
    client: clientResult
  };
}
