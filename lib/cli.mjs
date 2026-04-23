const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_ENDPOINT = "/mcp";

function normalizeTransport(value) {
  if (value === "stdio") {
    return "stdio";
  }

  if (value === "http" || value === "streamable-http") {
    return "http";
  }

  throw new Error(`Unsupported transport "${value}". Use "stdio" or "http".`);
}

function normalizeEndpoint(value) {
  if (!value || typeof value !== "string") {
    throw new Error("Endpoint must be a non-empty string.");
  }

  return value.startsWith("/") ? value : `/${value}`;
}

function parsePort(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port "${value}". Expected an integer between 1 and 65535.`);
  }

  return parsed;
}

export function parseCliArgs(argv = []) {
  const result = {
    configure: false,
    transport: "stdio",
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    endpoint: DEFAULT_ENDPOINT
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--configure":
        result.configure = true;
        break;
      case "--transport":
        result.transport = normalizeTransport(argv[++index]);
        break;
      case "--host":
        result.host = argv[++index] || DEFAULT_HOST;
        break;
      case "--port":
        result.port = parsePort(argv[++index]);
        break;
      case "--endpoint":
        result.endpoint = normalizeEndpoint(argv[++index]);
        break;
      case "--help":
        break;
      default:
        throw new Error(`Unknown argument "${arg}".`);
    }
  }

  return result;
}

export function formatUsage() {
  return [
    "Usage: mcp-imagegen-server [--configure] [--transport stdio|http] [--host HOST] [--port PORT] [--endpoint PATH]",
    "",
    "Defaults:",
    `  transport: stdio`,
    `  host: ${DEFAULT_HOST}`,
    `  port: ${DEFAULT_PORT}`,
    `  endpoint: ${DEFAULT_ENDPOINT}`
  ].join("\n");
}

export { DEFAULT_ENDPOINT, DEFAULT_HOST, DEFAULT_PORT };
