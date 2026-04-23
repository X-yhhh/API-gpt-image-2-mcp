import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const APP_DIRECTORY_NAME = "mcp-imagegen-server";
const APP_CONFIG_FILENAME = "config.json";
const DEFAULT_MODEL = "gpt-image-2";
const CONFIG_FIELDS = ["baseUrl", "apiKey", "model"];
const ENV_FIELD_NAMES = {
  baseUrl: "IMAGEGEN_BASE_URL",
  apiKey: "IMAGEGEN_API_KEY",
  model: "IMAGEGEN_MODEL"
};

export class RuntimeConfigValidationError extends Error {
  constructor(fieldErrors) {
    super("Invalid runtime config.");
    this.name = "RuntimeConfigValidationError";
    this.fieldErrors = fieldErrors;
  }
}

function ensureString(value, name) {
  if (!value || typeof value !== "string") {
    throw new Error(`Missing required ${name}.`);
  }

  return value;
}

function getPathModule(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

function resolveHomeDirectory(env, platform = process.platform) {
  const homeDirectory =
    env.HOME ||
    env.USERPROFILE ||
    (env.HOMEDRIVE && env.HOMEPATH ? `${env.HOMEDRIVE}${env.HOMEPATH}` : undefined) ||
    os.homedir();

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

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function pickConfigFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return CONFIG_FIELDS.reduce((result, field) => {
    const normalized = normalizeOptionalString(value[field]);

    if (normalized !== undefined) {
      result[field] = normalized;
    }

    return result;
  }, {});
}

function withEmptyConfigShape(fileConfig) {
  return {
    baseUrl: fileConfig.baseUrl ?? "",
    apiKey: fileConfig.apiKey ?? "",
    model: fileConfig.model ?? ""
  };
}

function getEnvValues(env) {
  return CONFIG_FIELDS.reduce((result, field) => {
    const normalized = normalizeOptionalString(env[ENV_FIELD_NAMES[field]]);

    if (normalized !== undefined) {
      result[field] = normalized;
    }

    return result;
  }, {});
}

function resolveFieldSource({ field, fileConfig, envConfig }) {
  if (envConfig[field] !== undefined) {
    return "env";
  }

  if (fileConfig[field] !== undefined) {
    return "file";
  }

  return "default";
}

function resolveEffectiveField({ field, fileConfig, envConfig }) {
  const rawValue = envConfig[field] ?? fileConfig[field];

  if (rawValue !== undefined) {
    return field === "baseUrl" ? normalizeBaseUrl(rawValue) : rawValue;
  }

  return field === "model" ? DEFAULT_MODEL : "";
}

function stripUtf8Bom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function readJsonFile(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(stripUtf8Bom(text));
}

async function writeUtf8File(filePath, text) {
  await fs.writeFile(filePath, Buffer.from(text, "utf8"));
}

export function resolveConfigPath({ env = process.env, platform = process.platform } = {}) {
  const pathModule = getPathModule(platform);

  if (env.IMAGEGEN_CONFIG_PATH) {
    return pathModule.resolve(env.IMAGEGEN_CONFIG_PATH);
  }

  if (platform === "win32") {
    const homeDirectory = resolveHomeDirectory(env, platform);
    const configHome = env.APPDATA || pathModule.join(homeDirectory, "AppData", "Roaming");
    return pathModule.join(configHome, APP_DIRECTORY_NAME, APP_CONFIG_FILENAME);
  }

  const configHome = env.XDG_CONFIG_HOME || pathModule.join(resolveHomeDirectory(env, platform), ".config");
  return pathModule.join(configHome, APP_DIRECTORY_NAME, APP_CONFIG_FILENAME);
}

export function resolveImageDataRoot({ env = process.env, platform = process.platform } = {}) {
  const pathModule = getPathModule(platform);

  if (platform === "win32") {
    const homeDirectory = resolveHomeDirectory(env, platform);
    const dataHome = env.LOCALAPPDATA || pathModule.join(homeDirectory, "AppData", "Local");
    return pathModule.join(dataHome, APP_DIRECTORY_NAME, "images");
  }

  const dataHome = env.XDG_DATA_HOME || pathModule.join(resolveHomeDirectory(env, platform), ".local", "share");
  return pathModule.join(dataHome, APP_DIRECTORY_NAME, "images");
}

export async function readRuntimeConfigFile({ env = process.env, configPath } = {}) {
  const resolvedConfigPath = configPath || resolveConfigPath({ env });

  try {
    const file = await readJsonFile(resolvedConfigPath);

    return {
      configPath: resolvedConfigPath,
      exists: true,
      fileConfig: pickConfigFields(file)
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        configPath: resolvedConfigPath,
        exists: false,
        fileConfig: {}
      };
    }

    throw error;
  }
}

export async function getRuntimeConfigState({ env = process.env, configPath } = {}) {
  const { configPath: resolvedConfigPath, fileConfig } = await readRuntimeConfigFile({
    env,
    configPath
  });
  const envConfig = getEnvValues(env);
  const effectiveConfig = {
    baseUrl: resolveEffectiveField({ field: "baseUrl", fileConfig, envConfig }),
    apiKey: resolveEffectiveField({ field: "apiKey", fileConfig, envConfig }),
    model: resolveEffectiveField({ field: "model", fileConfig, envConfig })
  };
  const fieldSources = {
    baseUrl: resolveFieldSource({ field: "baseUrl", fileConfig, envConfig }),
    apiKey: resolveFieldSource({ field: "apiKey", fileConfig, envConfig }),
    model: resolveFieldSource({ field: "model", fileConfig, envConfig })
  };

  return {
    configPath: resolvedConfigPath,
    fileConfig: withEmptyConfigShape(fileConfig),
    effectiveConfig,
    fieldSources,
    hasOverrides: Object.values(fieldSources).includes("env")
  };
}

export function validateRuntimeConfigInput(config) {
  const normalized = pickConfigFields(config);
  const fieldErrors = {};
  let normalizedBaseUrl = "";

  if (!normalized.baseUrl) {
    fieldErrors.baseUrl = "Base URL must be a valid URL.";
  } else {
    try {
      normalizedBaseUrl = normalizeBaseUrl(normalized.baseUrl);
    } catch {
      fieldErrors.baseUrl = "Base URL must be a valid URL.";
    }
  }

  if (!normalized.apiKey) {
    fieldErrors.apiKey = "API key is required.";
  }

  if (!normalized.model) {
    fieldErrors.model = "Model is required.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors
    };
  }

  return {
    ok: true,
    config: {
      baseUrl: normalizedBaseUrl,
      apiKey: normalized.apiKey,
      model: normalized.model
    }
  };
}

export async function writeRuntimeConfigFile({ env = process.env, configPath, config } = {}) {
  const resolvedConfigPath = configPath || resolveConfigPath({ env });
  const validation = validateRuntimeConfigInput(config);

  if (!validation.ok) {
    throw new RuntimeConfigValidationError(validation.fieldErrors);
  }

  await fs.mkdir(path.dirname(resolvedConfigPath), { recursive: true });
  await writeUtf8File(`${resolvedConfigPath}`, `${JSON.stringify(validation.config, null, 2)}\n`);

  return {
    configPath: resolvedConfigPath,
    fileConfig: validation.config
  };
}

export async function loadRuntimeConfig({ env = process.env, configPath } = {}) {
  const state = await getRuntimeConfigState({ env, configPath });

  return {
    baseUrl: ensureString(state.effectiveConfig.baseUrl, "baseUrl"),
    apiKey: ensureString(state.effectiveConfig.apiKey, "apiKey"),
    model: ensureString(state.effectiveConfig.model || DEFAULT_MODEL, "model")
  };
}

export { APP_CONFIG_FILENAME, APP_DIRECTORY_NAME, DEFAULT_MODEL, normalizeBaseUrl };
