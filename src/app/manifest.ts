import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#f6f8fb",
    description: "LINE official account message viewer for BB Cafe.",
    display: "standalone",
    icons: [
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    name: "BB Cafe Messages",
    scope: "/",
    short_name: "BB Cafe",
    start_url: "/",
    theme_color: "#1b6f5d",
  };
}
