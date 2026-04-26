import Credentials from "next-auth/providers/credentials"

export const mockProvider = Credentials({
  id: "mock",
  name: "Mock Login",
  credentials: {
    username: { label: "用户名", type: "text", placeholder: "输入任意用户名测试" },
  },
  async authorize(credentials) {
    if (!credentials?.username) return null

    return {
      id: "mock-user-id",
      name: credentials.username as string,
      email: `${credentials.username}@example.com`,
      image: null,
    }
  },
})
