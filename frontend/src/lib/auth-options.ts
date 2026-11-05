import { AuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

export const authOptions: AuthOptions = {
  pages: {
    signIn: "/signin",
  },
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      authorization: {
        params: {
          scope: "repo workflow read:user",
        },
      },
    }),
  ],

  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },

    // The GitHub token stays in the encrypted JWT cookie and is read server-side
    // with getToken(); it is deliberately not copied onto the client session.
    async session({ session }) {
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};