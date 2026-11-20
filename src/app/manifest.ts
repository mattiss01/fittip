import type { MetadataRoute } from "next";

// Lets Android install FitTip from Chrome and open it without the browser bar.
// The colours are the page background (sage), so the status bar and the
// splash screen match what the first screen paints. Opens on Home: someone
// signed out is sent to sign-in by the proxy as on any other visit. The icons
// in public/ are the fit/tip mark of apple-icon.png; the maskable one keeps
// the lettering inside the centre circle Android crops to.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FitTip",
    short_name: "FitTip",
    description: "Your training plan, coach and log.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#edf0e8",
    theme_color: "#edf0e8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
