import http from "node:http";
import { execSync } from "node:child_process";
import express from "express";
import { WebSocketServer } from "ws";
import { expressAuthMiddleware, authEnabled } from "./auth.js";
import { handleAgentConnection } from "./agent-ws.js";
import { handleShellConnection } from "./shell-ws.js";
import { mountGitRoutes } from "./git-routes.js";
import { mountFsRoutes } from "./fs-routes.js";

const PKG_VERSION = "0.1.0";

function getClaudeVersion() {
  try {
    const raw = execSync(`${process.env.CLAUDE_CLI_PATH || "claude"} --version`, {
      timeout: 3000,
    })
      .toString()
      .trim();
    return raw;
  } catch (err) {
    return null;
  }
}

export async function startServer({ port = 3030, host = "127.0.0.1", cwd = process.cwd() } = {}) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      runtimeVersion: PKG_VERSION,
      claudeVersion: getClaudeVersion(),
      cwd,
      authEnabled: authEnabled(),
    });
  });

  // M7: git operations (JWT-guarded)
  app.use("/git", expressAuthMiddleware);
  mountGitRoutes(app, { cwd });

  // M9: filesystem operations (JWT-guarded)
  app.use("/fs", expressAuthMiddleware);
  mountFsRoutes(app, { cwd });

  const server = http.createServer(app);

  const wssAgent = new WebSocketServer({ noServer: true });
  wssAgent.on("connection", (ws, req) => handleAgentConnection(ws, req, { cwd }));

  const wssShell = new WebSocketServer({ noServer: true });
  wssShell.on("connection", (ws, req) => handleShellConnection(ws, req, { cwd }));

  server.on("upgrade", (req, socket, head) => {
    const url = req.url || "";
    if (url.startsWith("/agent")) {
      wssAgent.handleUpgrade(req, socket, head, (ws) => wssAgent.emit("connection", ws, req));
    } else if (url.startsWith("/shell")) {
      wssShell.handleUpgrade(req, socket, head, (ws) => wssShell.emit("connection", ws, req));
    } else {
      socket.destroy();
    }
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  console.log(
    `[agent-runtime] listening on ${host}:${port} (cwd=${cwd}, auth=${authEnabled() ? "jwt" : "disabled"}, claude=${getClaudeVersion() ?? "not-found"})`
  );

  const shutdown = (sig) => {
    console.log(`[agent-runtime] ${sig} received, shutting down`);
    wssAgent.close();
    wssShell.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  return { server, wssAgent, wssShell };
}
