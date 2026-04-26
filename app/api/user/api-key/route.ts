import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { createClient } from "@/lib/supabase/server"
import { encrypt } from "@/lib/crypto"

// POST /api/user/api-key - Save user's Anthropic config (encrypted)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { apiKey, baseUrl } = body

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

  // Encrypt API key before storing
  const encryptedKey = encrypt(apiKey)

  const { error } = await supabase
    .from("users")
    .update({
      anthropic_api_key_encrypted: encryptedKey,
      anthropic_base_url: baseUrl || null,
    })
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
    .select("anthropic_api_key_encrypted, anthropic_base_url")
    .eq("github_id", session.user.githubId)
    .single()

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  return NextResponse.json({
    hasKey: !!user.anthropic_api_key_encrypted,
    hasBaseUrl: !!user.anthropic_base_url,
    // Never return the actual key
  })
}
