import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { consumeWalletLoginTicket } from "@/lib/wallet-login-ticket";

declare module "next-auth" {
  interface User {
    walletAddress: string;
    loginId: string;
    username: string;
    profilePictureUrl: string;
  }

  interface Session {
    user: {
      walletAddress: string;
      loginId: string;
      username: string;
      profilePictureUrl: string;
    } & DefaultSession["user"];
  }
}

// Auth configuration for Wallet Auth based sessions
// For more information on each option (and a full list of options) go to
// https://authjs.dev/getting-started/authentication/credentials
export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  session: { strategy: "jwt", maxAge: 3600 },
  providers: [
    Credentials({
      name: "World App Wallet",
      credentials: {
        ticket: { label: "Login ticket", type: "text" },
      },
      authorize: async (credentials) => {
        const ticket =
          typeof credentials?.ticket === "string" ? credentials.ticket : "";
        const walletLogin = await consumeWalletLoginTicket(ticket);
        if (!walletLogin) return null;
        return {
          id: walletLogin.walletAddress,
          walletAddress: walletLogin.walletAddress,
          loginId: walletLogin.loginId,
          username: "",
          profilePictureUrl: "",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.walletAddress = user.walletAddress;
        token.loginId = user.loginId;
        token.username = user.username;
        token.profilePictureUrl = user.profilePictureUrl;
      }

      return token;
    },
    session: async ({ session, token }) => {
      if (token.userId) {
        session.user.id = token.userId as string;
        session.user.walletAddress = token.walletAddress as string;
        session.user.loginId = token.loginId as string;
        session.user.username = token.username as string;
        session.user.profilePictureUrl = token.profilePictureUrl as string;
      }

      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
