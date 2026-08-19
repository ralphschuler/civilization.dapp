import { runtimeConfiguration } from "@/lib/runtime-config";
import { miniKitProviderConfiguration } from "@/lib/minikit-configuration";
import { civilizationMessages } from "@/lib/civilization-locale";
import ClientProviders from "@/providers";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Civilization DApp",
  description: civilizationMessages("de-DE").metadataDescription,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  const configuration = runtimeConfiguration();
  return (
    <html lang="de">
      <body className={`${geistSans.variable} ${geistMono.variable} `}>
        <ClientProviders miniKit={miniKitProviderConfiguration(configuration)}>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
