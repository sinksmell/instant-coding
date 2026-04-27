import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"
import { createClient } from "@/lib/supabase/server"
import { createGitHubClient, createPullRequest } from "@/lib/github/client"

/**
 * POST /api/agent/pr/<taskId>
 *   body: { title, body?, head: branch, base?: "main" }
 *
 * Opens a PR against task.repo_owner/task.repo_name using the user's GitHub
 * OAuth token, then stores pr_url on the task row. This runs on the BFF —
 * the Codespace already pushed the branch via /api/agent/git/<id>/push.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: { taskId: string } },
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.githubId || !session.accessToken) {
    return NextResponse.json({ error: "auth_failed" }, { status: 401 })
  }

  const body = (await req.json()) as {
    title?: string
    body?: string
    head?: string
    base?: string
  }
  const { title, body: prBody, head, base } = body
  if (!title || !head) {
    return NextResponse.json({ error: "bad_request", message: "title and head required" }, { status: 400 })
  }

  const supabase = createClient()
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("github_id", session.user.githubId)
    .single()
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 })

  const { data: task } = await supabase
    .from("tasks")
    .select("id, user_id, repo_owner, repo_name, branch")
    .eq("id", ctx.params.taskId)
    .single()
  if (!task) return NextResponse.json({ error: "task_not_found" }, { status: 404 })
  if (task.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  if (!task.repo_owner || !task.repo_name) {
    return NextResponse.json({ error: "bad_request", message: "task has no repo bound" }, { status: 400 })
  }

  const octokit = createGitHubClient(session.accessToken)
  try {
    const pr = await createPullRequest(
      octokit,
      task.repo_owner,
      task.repo_name,
      title,
      head,
      base || task.branch || "main",
      prBody,
    )

    await supabase.from("tasks").update({ pr_url: pr.html_url }).eq("id", task.id)

    return NextResponse.json({
      url: pr.html_url,
      number: pr.number,
      state: pr.state,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "pr_failed"
    return NextResponse.json({ error: "pr_failed", message }, { status: 500 })
  }
}
