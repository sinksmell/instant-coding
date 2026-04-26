import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { createGitHubClient, listUserRepos } from "@/lib/github/client"

export async function GET() {
  const session = await auth()
  if (!session?.user?.githubId || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const octokit = createGitHubClient(session.accessToken)
    const repos = await listUserRepos(octokit)
    return NextResponse.json({ repos })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch repos"
    console.error("GitHub repos error:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
