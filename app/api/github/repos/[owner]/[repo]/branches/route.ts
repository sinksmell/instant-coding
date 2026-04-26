import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { createGitHubClient, listBranches } from "@/lib/github/client"

export async function GET(
  _req: Request,
  { params }: { params: { owner: string; repo: string } }
) {
  const session = await auth()
  if (!session?.user?.githubId || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const octokit = createGitHubClient(session.accessToken)
    const branches = await listBranches(octokit, params.owner, params.repo)
    return NextResponse.json({ branches })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch branches"
    console.error("GitHub branches error:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
