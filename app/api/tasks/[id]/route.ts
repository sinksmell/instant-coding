import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const { data: task, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single()

  if (error || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 })
  }

  return NextResponse.json({ task })
}
