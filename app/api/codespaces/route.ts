import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createClient } from "@/lib/supabase/server"
import { createGitHubClient } from "@/lib/github/client"
import { listCodespaces, createCodespace } from "@/lib/github/codespaces"

// GET /api/codespaces - List user's codespaces (from DB + sync with GitHub)
export async function GET() {
  const session = await auth()
  if (!session?.user?.githubId || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createClient()

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("github_id", session.user.githubId)
    .single()

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // Sync with GitHub
  try {
    const octokit = createGitHubClient(session.accessToken)
    const ghCodespaces = await listCodespaces(octokit)

    // Upsert into DB
    for (const cs of ghCodespaces) {
      if (!cs.name) continue
      await supabase
        .from("codespaces")
        .upsert({
          user_id: user.id,
          repo_owner: cs.repository?.owner?.login || "",
          repo_name: cs.repository?.name || "",
          branch: cs.git_status?.ref || "main",
          codespace_name: cs.name,
          machine_type: cs.machine?.name || "basicLinux32gb",
          status: cs.state || "Unknown",
          web_url: cs.web_url,
          last_used_at: cs.last_used_at,
        }, { onConflict: "codespace_name" })
    }
  } catch (err) {
    console.error("Sync codespaces failed:", err)
  }

  const { data: codespaces, error } = await supabase
    .from("codespaces")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: "Failed to fetch codespaces" }, { status: 500 })
  }

  return NextResponse.json({ codespaces: codespaces || [] })
}

// POST /api/codespaces - Create a new codespace
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.githubId || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { repo_owner, repo_name, branch = "main", machine_type = "basicLinux32gb" } = body

  if (!repo_owner || !repo_name) {
    return NextResponse.json({ error: "Repo owner and name are required" }, { status: 400 })
  }

  const supabase = createClient()

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("github_id", session.user.githubId)
    .single()

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  try {
    const octokit = createGitHubClient(session.accessToken)
    const cs = await createCodespace(octokit, repo_owner, repo_name, branch, machine_type)

    // Save to DB
    const { data: record, error } = await supabase
      .from("codespaces")
      .insert({
        user_id: user.id,
        repo_owner,
        repo_name,
        branch,
        codespace_name: cs.name,
        machine_type: cs.machine?.name || machine_type,
        status: cs.state || "Provisioning",
        web_url: cs.web_url,
      })
      .select()
      .single()

    if (error) {
      console.error("Failed to save codespace:", error)
    }

    return NextResponse.json({ codespace: record || cs }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create codespace"
    console.error("Create codespace error:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
