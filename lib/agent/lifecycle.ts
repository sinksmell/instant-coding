import type { Octokit } from "octokit"
import { createClient } from "@/lib/supabase/server"
import { createGitHubClient } from "@/lib/github/client"

const AGENT_RUNTIME_PORT = 3030
const AVAILABLE_POLL_INTERVAL_MS = 3_000
const DEFAULT_BOOT_TIMEOUT_MS = 120_000

/**
 * Error class with a machine-readable `code` matching the WS error codes
 * defined in ARCHITECTURE §5.4.
 */
export class LifecycleError extends Error {
  code: string
  httpStatus: number
  constructor(code: string, message: string, httpStatus = 503) {
    super(message)
    this.code = code
    this.httpStatus = httpStatus
  }
}

export interface RuntimeEndpoint {
  /** wss URL that speaks the agent-runtime protocol (see ARCHITECTURE §5.3) */
  url: string
  /** Extra headers BFF should send on the upstream WS handshake */
  headers: Record<string, string>
}

/**
 * Returns a ready-to-connect endpoint for the agent-runtime that services the
 * given task. Drives the Codespace state machine:
 *   Shutdown/Stopped → start → poll until Available
 *   Failed → throw
 *   Available → return
 *
 * Dev override: if AGENT_RUNTIME_DEV_URL is set, short-circuits to a local
 * runtime (useful for testing the BFF proxy against `npm run dev` in
 * apps/agent-runtime). Also honored when codespaceId is null.
 */
export async function ensureRunning(opts: {
  codespaceId: string | null
  userId: string
  accessToken: string
  timeoutMs?: number
}): Promise<RuntimeEndpoint> {
  const devUrl = process.env.AGENT_RUNTIME_DEV_URL
  if (devUrl) {
    return { url: devUrl, headers: {} }
  }

  if (!opts.codespaceId) {
    throw new LifecycleError(
      "codespace_not_bound",
      "This task has no codespace_id; cannot route to a runtime. Bind a Codespace to the task or set AGENT_RUNTIME_DEV_URL for local dev.",
      400,
    )
  }

  const supabase = createClient()
  const { data: cs, error } = await supabase
    .from("codespaces")
    .select("codespace_name, user_id, status")
    .eq("id", opts.codespaceId)
    .single()

  if (error || !cs) {
    throw new LifecycleError("codespace_not_found", "Codespace record not found", 404)
  }
  if (cs.user_id !== opts.userId) {
    throw new LifecycleError("auth_failed", "Codespace is not owned by this user", 403)
  }

  const octokit = createGitHubClient(opts.accessToken)
  await waitForAvailable(
    octokit,
    cs.codespace_name,
    opts.timeoutMs ?? DEFAULT_BOOT_TIMEOUT_MS,
  )

  const host = `${cs.codespace_name}-${AGENT_RUNTIME_PORT}.app.github.dev`
  return {
    url: `wss://${host}/agent`,
    headers: {
      // GitHub private port forwarding: authenticate the BFF's connection
      // to the Codespace's forwarded port using the user's OAuth token.
      "X-Github-Token": opts.accessToken,
    },
  }
}

async function waitForAvailable(
  octokit: Octokit,
  codespaceName: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let startTriggered = false

  while (Date.now() < deadline) {
    const { data } = await octokit.rest.codespaces.getForAuthenticatedUser({
      codespace_name: codespaceName,
    })
    const state = data.state ?? "Unknown"

    if (state === "Available") return

    if (state === "Failed") {
      throw new LifecycleError(
        "codespace_boot_failed",
        `Codespace ${codespaceName} is in Failed state`,
      )
    }

    // Shutdown / Archived → kick off start, but only once per call
    if (!startTriggered && (state === "Shutdown" || state === "Archived")) {
      await octokit.rest.codespaces.startForAuthenticatedUser({
        codespace_name: codespaceName,
      })
      startTriggered = true
    }

    // Otherwise state is Provisioning / Starting / Queued — wait and re-poll
    await new Promise((r) => setTimeout(r, AVAILABLE_POLL_INTERVAL_MS))
  }

  throw new LifecycleError(
    "codespace_boot_timeout",
    `Timed out after ${timeoutMs}ms waiting for ${codespaceName} to become Available`,
  )
}
