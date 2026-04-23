import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const APP_DIRECTORY_NAME = "mcp-imagegen-server";
const APP_CONFIG_FILENAME = "config.json";
const DEFAULT_MODEL = "gpt-image-2";

function ensureString(value, name) {
  if (!value || typeof value !== "string") {
    throw new Error(`Missing required ${name}.`);
  }

  return value;
}

function resolveHomeDirectory(env) {
  const homeDirectory = env.HOME || os.homedir();

  if (!homeDirectory) {
    throw new Error("Unable to resolve the current user's home directory.");
  }

  return homeDirectory;
}

function normalizeBaseUrl(value) {
  const url = new URL(value.trim());
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname === "" || pathname === "/" ? "/v1" : pathname;
  return url.toString().replace(/\/$/, "");
}

async function readJsonFile(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

export function resolveConfigPath({ env = process.env } = {}) {
  if (env.IMAGEGEN_CONFIG_PATH) {
    return path.resolve(env.IMAGEGEN_CONFIG_PATH);
  }

  const configHome = env.XDG_CONFIG_HOME || path.join(resolveHomeDirectory(env), ".config");
  return path.join(configHome, APP_DIRECTORY_NAME, APP_CONFIG_FILENAME);
}

export function resolveImageDataRoot({ env = process.env } = {}) {
  const dataHome = env.XDG_DATA_HOME || path.join(resolveHomeDirectory(env), ".local", "share");
  return path.join(dataHome, APP_DIRECTORY_NAME, "images");
}

export async function loadRuntimeConfig({ env = process.env, configPath } = {}) {
  const resolvedConfigPath = configPath || resolveConfigPath({ env });
  let file = {};

  try {
    file = await readJsonFile(resolvedConfigPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  return {
    baseUrl: normalizeBaseUrl(ensureString(env.IMAGEGEN_BASE_URL || file.baseUrl, "baseUrl")),
    apiKey: ensureString(env.IMAGEGEN_API_KEY || file.apiKey, "apiKey"),
    model: ensureString(env.IMAGEGEN_MODEL || file.model || DEFAULT_MODEL, "model")
  };
}

export { APP_CONFIG_FILENAME, APP_DIRECTORY_NAME, DEFAULT_MODEL, normalizeBaseUrl };
