import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

function getUsers() {
  const users: { id: string; name: string; email: string; password: string }[] = []
  let i = 1
  while (process.env[`AUTH_USER_${i}_NAME`]) {
    users.push({
      id: String(i),
      name: process.env[`AUTH_USER_${i}_NAME`]!,
      email: process.env[`AUTH_USER_${i}_EMAIL`] ?? `user${i}@company.com`,
      password: process.env[`AUTH_USER_${i}_PASSWORD`]!,
    })
    i++
  }
  // Fallback for dev if no env vars set
  if (!users.length) {
    users.push({ id: '1', name: 'admin', email: 'admin@company.com', password: 'admin123' })
  }
  return users
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null
        const users = getUsers()
        const user = users.find(
          (u) =>
            u.name.toLowerCase() === credentials.username.toLowerCase() &&
            u.password === credentials.password,
        )
        if (!user) return null
        return { id: user.id, name: user.name, email: user.email }
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8-hour sessions
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user) (session.user as Record<string, unknown>).id = token.id
      return session
    },
  },
}
