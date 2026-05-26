import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  description: "LINE official account message viewer for BB Cafe.",
  title: "BB Cafe Messages",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
