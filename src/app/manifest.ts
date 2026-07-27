import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Green Ecocare CRM",
    short_name: "Green Ecocare",
    description: "CRM for Green Ecocare — wastewater treatment plant projects",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#052a1c",
    theme_color: "#0f7a4d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
