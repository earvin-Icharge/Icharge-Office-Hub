import type { MetadataRoute } from "next";

/** Lets staff install Office Hub on their phone (spec 2: PWA). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "iCharge Office Hub",
    short_name: "Office Hub",
    description: "Work and HR app for iCharge staff",
    id: "/today",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F8F1",
    theme_color: "#16210F",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
