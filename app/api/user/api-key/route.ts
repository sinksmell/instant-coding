import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createClient } from "@/lib/supabase/server"

// POST /api/user/api-key - Save user's Claude API Key
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { apiKey } = body

  if (!apiKey || typeof apiKey !== "string") {
    return NextResponse.json({ error: "API Key is required" }, { status: 400 })
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

  // For MVP: store API key as-is. In production, encrypt with AES-256-GCM.
  const { error } = await supabase
    .from("users")
    .update({ api_key_encrypted: apiKey })
    .eq("id", user.id)

  if (error) {
    console.error("Failed to save API key:", error)
    return NextResponse.json({ error: "Failed to save API key" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// GET /api/user/api-key - Check if user has API key configured
export async function GET() {
  const session = await auth()
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createClient()

  const { data: user } = await supabase
    .from("users")
    .select("api_key_encrypted")
    .eq("github_id", session.user.githubId)
    .single()

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  return NextResponse.json({
    hasKey: !!user.api_key_encrypted,
    // Never return the actual key
  })
}
