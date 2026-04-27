import { createServer } from "node:http"
import { parse } from "node:url"
import next from "next"
import { WebSocketServer } from "ws"
import { handleAgentUpgrade } from "@/lib/agent/upgrade-handler"

const dev = process.env.NODE_ENV !== "production"
const port = Number(process.env.PORT ?? 3000)
const hostname = process.env.HOSTNAME ?? "0.0.0.0"

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()
const upgradeHandler = (app as unknown as { getUpgradeHandler?: () => (req: unknown, socket: unknown, head: unknown) => void })
  .getUpgradeHandler?.()

const wss = new WebSocketServer({ noServer: true })

async function main() {
  await app.prepare()

  const server = createServer((req, res) => {
    const parsed = parse(req.url ?? "/", true)
    handle(req, res, parsed)
  })

  server.on("upgrade", (req, socket, head) => {
    const url = parse(req.url ?? "/", true)
    if (url.pathname === "/api/agent/ws") {
      handleAgentUpgrade(req, socket, head, wss, {
        upstreamPath: "/agent",
        injectApiKey: true,
      }).catch((err) => {
        console.error("[server] agent upgrade crashed:", err)
        try { socket.destroy() } catch { /* noop */ }
      })
      return
    }
    if (url.pathname === "/api/agent/shell/ws") {
      handleAgentUpgrade(req, socket, head, wss, {
        upstreamPath: "/shell",
        injectApiKey: false,
      }).catch((err) => {
        console.error("[server] shell upgrade crashed:", err)
        try { socket.destroy() } catch { /* noop */ }
      })
      return
    }

    // Let Next.js handle its own upgrades (HMR / Turbopack in dev)
    if (upgradeHandler) {
      upgradeHandler(req, socket, head)
    } else {
      try { socket.destroy() } catch { /* noop */ }
    }
  })

  server.listen(port, hostname, () => {
    const scheme = dev ? "http" : "http"
    console.log(`> Ready on ${scheme}://${hostname}:${port}`)
    console.log(`> Agent WS:   ws://${hostname}:${port}/api/agent/ws?taskId=<uuid>`)
    console.log(`> Shell WS:   ws://${hostname}:${port}/api/agent/shell/ws?taskId=<uuid>`)
  })
}

main().catch((err) => {
  console.error("[server] fatal:", err)
  process.exit(1)
})
