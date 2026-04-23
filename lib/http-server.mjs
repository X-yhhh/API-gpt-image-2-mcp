import http from "node:http";
import { randomUUID } from "node:crypto";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createImageGenServer } from "./mcp-server.mjs";

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

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text);
}

export async function startHttpServer({ host, port, endpoint } = {}) {
  const transports = new Map();
  const serversBySessionId = new Map();

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
    const pathname = requestUrl.pathname;

    if (pathname !== endpoint) {
      sendText(res, 404, "Not found.");
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

          const mcpServer = createImageGenServer();
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
