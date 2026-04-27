import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { HTTP_TRANSPORT_POLICY } from "./imagegen.mjs";
import { createImageGenServer } from "./mcp-server.mjs";

const HTTP_AUTH_TOKEN_ENV_NAME = "IMAGEGEN_MCP_AUTH_TOKEN";
const MAX_HTTP_BODY_BYTES = 20 * 1024 * 1024;
class RequestBodyTooLargeError extends Error {}

function isInitializeRequest(body) {
  return body?.method === "initialize";
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function sendText(res, statusCode, message, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(message);
}

function sendJsonRpcError(res, statusCode, errorCode, message) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: errorCode,
      message
    },
    id: null
  });

  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(body);
}

function sendUnauthorized(res) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32001,
      message: "Unauthorized."
    },
    id: null
  });

  res.writeHead(401, {
    "Content-Type": "application/json",
    "WWW-Authenticate": "Bearer"
  });
  res.end(body);
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") {
    return undefined;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return undefined;
  }

  return normalizeOptionalString(match[1]);
}

function tokensMatch(expectedToken, providedToken) {
  const expectedBuffer = Buffer.from(expectedToken, "utf8");
  const providedBuffer = Buffer.from(providedToken, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function isAuthorizedRequest(req, expectedToken) {
  if (!expectedToken) {
    return true;
  }

  const providedToken = parseBearerToken(req.headers.authorization);

  if (!providedToken) {
    return false;
  }

  return tokensMatch(expectedToken, providedToken);
}

async function readJsonBody(req) {
  const contentLength = Number(req.headers["content-length"]);

  if (Number.isFinite(contentLength) && contentLength > MAX_HTTP_BODY_BYTES) {
    throw new RequestBodyTooLargeError(`Request body exceeds the ${MAX_HTTP_BODY_BYTES} byte limit.`);
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.byteLength;

    if (totalBytes > MAX_HTTP_BODY_BYTES) {
      throw new RequestBodyTooLargeError(`Request body exceeds the ${MAX_HTTP_BODY_BYTES} byte limit.`);
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const text = Buffer.concat(chunks, totalBytes).toString("utf8");
  return JSON.parse(text);
}

export async function startHttpServer({ host, port, endpoint, env = process.env } = {}) {
  const transports = new Map();
  const serversBySessionId = new Map();
  const httpAuthToken = normalizeOptionalString(env[HTTP_AUTH_TOKEN_ENV_NAME]);

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
    const pathname = requestUrl.pathname;

    if (pathname !== endpoint) {
      sendText(res, 404, "Not found.");
      return;
    }

    if (!isAuthorizedRequest(req, httpAuthToken)) {
      sendUnauthorized(res);
      return;
    }

    try {
      if (req.method === "POST") {
        const parsedBody = await readJsonBody(req);
        const sessionId = req.headers["mcp-session-id"];
        let transport = sessionId ? transports.get(sessionId) : null;

        if (!transport) {
          if (sessionId) {
            sendJsonRpcError(res, 404, -32001, "Unknown session ID.");
            return;
          }

          if (!isInitializeRequest(parsedBody)) {
            sendJsonRpcError(res, 400, -32000, "Missing initialization request.");
            return;
          }

          const mcpServer = createImageGenServer(HTTP_TRANSPORT_POLICY);
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
              transports.set(newSessionId, transport);
              serversBySessionId.set(newSessionId, mcpServer);
            }
          });

          transport.onclose = async () => {
            const activeSessionId = transport.sessionId;

            if (!activeSessionId) {
              return;
            }

            transports.delete(activeSessionId);

            const activeServer = serversBySessionId.get(activeSessionId);
            serversBySessionId.delete(activeSessionId);

            if (activeServer) {
              await activeServer.close();
            }
          };

          await mcpServer.connect(transport);
        }

        await transport.handleRequest(req, res, parsedBody);
        return;
      }

      if (req.method === "GET" || req.method === "DELETE") {
        const sessionId = req.headers["mcp-session-id"];
        const transport = sessionId ? transports.get(sessionId) : null;

        if (!transport) {
          sendJsonRpcError(res, 400, -32000, "Invalid or missing session ID.");
          return;
        }

        await transport.handleRequest(req, res);
        return;
      }

      sendJsonRpcError(res, 405, -32000, "Method not allowed.");
    } catch (error) {
      if (!res.headersSent) {
        if (error instanceof RequestBodyTooLargeError) {
          sendJsonRpcError(res, 413, -32000, error.message);
          return;
        }

        sendJsonRpcError(res, 500, -32603, error instanceof Error ? error.message : "Internal server error.");
      }
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    server,
    close: async () => {
      for (const transport of transports.values()) {
        await transport.close();
      }

      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

export { HTTP_AUTH_TOKEN_ENV_NAME, MAX_HTTP_BODY_BYTES };
