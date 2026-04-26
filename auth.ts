import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import { createClient } from "@supabase/supabase-js"
import type { DefaultSession } from "next-auth"
import { mockProvider } from "@/lib/auth/mock-provider"

declare module "next-auth" {
  interface Session {
    user: {
      githubId?: string
    } & DefaultSession["user"]
    accessToken?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubId?: string
    accessToken?: string
  }
}

const isMockMode = process.env.NEXTAUTH_MOCK === "true"

const supabaseAdmin = !isMockMode
  ? createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
  : null

const githubProvider = GitHub({
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  authorization: {
    params: {
      scope: "repo read:user user:email codespace",
    },
  },
})

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  providers: isMockMode ? [mockProvider] : [githubProvider],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (isMockMode) return true
      if (!user.email || !profile) return false

      const githubProfile = profile as {
        id: number
        login: string
        avatar_url: string
      }

      const { error } = await supabaseAdmin!.from("users").upsert(
        {
          github_id: githubProfile.id,
          email: user.email,
          name: user.name || githubProfile.login,
          avatar_url: user.image || githubProfile.avatar_url,
        },
        { onConflict: "github_id" }
      )

      if (error) {
        console.error("Failed to upsert user:", error)
        return false
      }

      return true
    },
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.githubId = String((profile as { id: number }).id)
        token.accessToken = account.access_token
      }
      return token
    },
    async session({ session, token }) {
      if (token.githubId) {
        session.user.githubId = token.githubId as string
      }
      if (token.accessToken) {
        session.accessToken = token.accessToken as string
      }
      return session
    },
  },
  pages: {
    signIn: "/",
  },
})
