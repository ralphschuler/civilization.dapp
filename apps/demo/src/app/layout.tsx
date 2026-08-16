import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Civilization Demo",
  description: "Walletlose Civilization-Demo",
};

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
