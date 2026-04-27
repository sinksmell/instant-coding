#!/usr/bin/env node
import { startServer } from "../src/server.js";

function parseArgs(argv) {
  const opts = { port: 3030, host: "127.0.0.1", cwd: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") opts.port = Number(argv[++i]);
    else if (a === "--host") opts.host = argv[++i];
    else if (a === "--cwd") opts.cwd = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: agent-runtime [--port 3030] [--host 127.0.0.1] [--cwd <path>]"
      );
      process.exit(0);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv);
startServer(opts).catch((err) => {
  console.error("[agent-runtime] fatal:", err);
  process.exit(1);
});
