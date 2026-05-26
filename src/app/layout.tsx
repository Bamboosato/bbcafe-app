import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  description: "LINE official account message viewer for BB Cafe.",
  icons: {
    apple: [{ sizes: "180x180", type: "image/png", url: "/apple-icon.png" }],
    icon: [
      { type: "image/svg+xml", url: "/app-icon.svg" },
      { sizes: "512x512", type: "image/png", url: "/app-icon-512.png" },
    ],
  },
  title: "BB Cafe Messages",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
