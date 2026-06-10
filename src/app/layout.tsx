import type { Metadata } from "next";
import { getPackageVersion } from "@/lib/app-version";
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
  const packageVersion = getPackageVersion();

  return (
    <html lang="ja">
      <body>
        <div className="site-frame">
          {children}
          <footer className="app-footer">© 2026 Bamboosato v{packageVersion}</footer>
        </div>
      </body>
    </html>
  );
}
