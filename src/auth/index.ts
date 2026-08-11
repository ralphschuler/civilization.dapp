import crypto from 'node:crypto';
import { MiniKit } from '@worldcoin/minikit-js';
import type { MiniAppWalletAuthSuccessPayload } from '@worldcoin/minikit-js/commands';
import { verifySiweMessage } from '@worldcoin/minikit-js/siwe';
import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { consumeAuthChallenge, readAuthChallenge } from '@/lib/auth-challenge';
import { getAddress, isAddress } from 'viem';

declare module 'next-auth' {
  interface User {
    walletAddress: string;
    username: string;
    profilePictureUrl: string;
  }

  interface Session {
    user: {
      walletAddress: string;
      username: string;
      profilePictureUrl: string;
    } & DefaultSession['user'];
  }
}

// Auth configuration for Wallet Auth based sessions
// For more information on each option (and a full list of options) go to
// https://authjs.dev/getting-started/authentication/credentials
export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: process.env.AUTH_TRUST_HOST === 'true',
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: 'World App Wallet',
      credentials: {
        nonce: { label: 'Nonce', type: 'text' },
        signedNonce: { label: 'Signed Nonce', type: 'text' },
        finalPayloadJson: { label: 'Final Payload', type: 'text' },
      },
      // @ts-expect-error TODO
      authorize: async ({
        nonce,
        signedNonce,
        finalPayloadJson,
      }: {
        nonce: string;
        signedNonce: string;
        finalPayloadJson: string;
      }) => {
        if (!nonce || !signedNonce || !finalPayloadJson || !process.env.HMAC_SECRET_KEY) return null;
        const expectedSignedNonce = crypto.createHmac('sha256', process.env.HMAC_SECRET_KEY).update(nonce).digest('hex');

        const suppliedNonceSignature = Buffer.from(signedNonce, 'utf8');
        const expectedNonceSignature = Buffer.from(expectedSignedNonce, 'utf8');

        if (suppliedNonceSignature.length !== expectedNonceSignature.length
          || !crypto.timingSafeEqual(suppliedNonceSignature, expectedNonceSignature)) {
          console.log('Invalid signed nonce');
          return null;
        }

        let finalPayload: MiniAppWalletAuthSuccessPayload;
        try { finalPayload = JSON.parse(finalPayloadJson); } catch { return null; }
        if (finalPayload.status !== 'success'
          || !finalPayload.address
          || !isAddress(finalPayload.address)
          || !finalPayload.message
          || !finalPayload.signature) return null;
        const challenge = await readAuthChallenge(nonce);
        if (!challenge) return null;
        const result = await verifySiweMessage(finalPayload, nonce, challenge.statement, challenge.requestId);

        if (!result.isValid || !result.siweMessageData.address || !isAddress(result.siweMessageData.address)) {
          console.log('Invalid final payload');
          return null;
        }
        const authUrl = process.env.AUTH_URL;
        if (!authUrl) return null;
        const expected = new URL(authUrl);
        let signedUri: URL;
        try { signedUri = new URL(result.siweMessageData.uri); } catch { return null; }
        if (result.siweMessageData.domain !== expected.host
          || signedUri.origin !== expected.origin
          || result.siweMessageData.chain_id !== 480
          || result.siweMessageData.version !== '1') return null;

        const verifiedAddress = getAddress(result.siweMessageData.address);
        if (getAddress(finalPayload.address) !== verifiedAddress) return null;
        if (!(await consumeAuthChallenge(nonce))) return null;

        let username = '';
        let profilePictureUrl = '';
        try {
          const userInfo = await MiniKit.getUserInfo(verifiedAddress);
          username = userInfo.username ?? '';
          profilePictureUrl = userInfo.profilePictureUrl ?? '';
        } catch (error) {
          console.warn('World profile lookup failed after wallet verification', error);
        }

        return {
          id: verifiedAddress,
          walletAddress: verifiedAddress,
          username,
          profilePictureUrl,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.walletAddress = user.walletAddress;
        token.username = user.username;
        token.profilePictureUrl = user.profilePictureUrl;
      }

      return token;
    },
    session: async ({ session, token }) => {
      if (token.userId) {
        session.user.id = token.userId as string;
        session.user.walletAddress = token.walletAddress as string;
        session.user.username = token.username as string;
        session.user.profilePictureUrl = token.profilePictureUrl as string;
      }

      return session;
    },
  },
});
