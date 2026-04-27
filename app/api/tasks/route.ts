import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createClient } from "@/lib/supabase/server"

// POST /api/tasks - Create a new task
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { title, description, repo_owner, repo_name, branch = "main", codespace_id } = body

  if (!description) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 })
  }

  const supabase = createClient()

  // Find user by github_id
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("github_id", session.user.githubId)
    .single()

  if (userError || !user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // Create task
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title: title || description.slice(0, 50),
      description,
      repo_owner,
      repo_name,
      branch,
      codespace_id: codespace_id || null,
      status: "pending",
    })
    .select()
    .single()

  if (taskError) {
    console.error("Failed to create task:", taskError)
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 })
  }

  // Agent execution is now driven by the browser: the chat page opens a
  // WebSocket to /api/agent/ws?taskId=<id>, which proxies to the Codespace
  // agent-runtime. See ARCHITECTURE §1.
  return NextResponse.json({ task }, { status: 201 })
}

// GET /api/tasks - List user's tasks
export async function GET() {
  const session = await auth()
  if (!session?.user?.githubId) {
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

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 })
  }

  return NextResponse.json({ tasks })
}
