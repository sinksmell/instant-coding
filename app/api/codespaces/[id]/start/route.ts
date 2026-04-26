import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { createClient } from "@/lib/supabase/server"
import { createGitHubClient } from "@/lib/github/client"
import { startCodespace } from "@/lib/github/codespaces"

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
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

  const { data: cs } = await supabase
    .from("codespaces")
    .select("codespace_name")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single()

  if (!cs?.codespace_name) {
    return NextResponse.json({ error: "Codespace not found" }, { status: 404 })
  }

  try {
    const octokit = createGitHubClient(session.accessToken)
    await startCodespace(octokit, cs.codespace_name)

    await supabase
      .from("codespaces")
      .update({ status: "Available" })
      .eq("id", params.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start codespace"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
