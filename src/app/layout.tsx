import { runtimeConfiguration } from '@/lib/runtime-config';
import ClientProviders from '@/providers';
import '@worldcoin/mini-apps-ui-kit-react/styles.css';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Civilization DApp',
  description: 'Civilization für World App',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { world } = runtimeConfiguration();
  return (
    <html lang="de">
      <body className={`${geistSans.variable} ${geistMono.variable} `}>
        <ClientProviders worldAppId={world.worldAppId}>{children}</ClientProviders>
      </body>
    </html>
  );
}
