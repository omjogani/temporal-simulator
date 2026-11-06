import type { Metadata } from "next";
import { Big_Shoulders, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const display = Big_Shoulders({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-big-shoulders", adjustFontFallback: false });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "Temporal Chaos Simulator",
  description: "Break a queue, then break Temporal, and watch what survives.",
};

// The board is designed at 1440 × DESIGN_H CSS px. On bigger screens (or a projector at
// 100% zoom) the whole page is scaled up to fit the window instead of floating small in
// the middle. It runs before paint and on resize.
const DESIGN_W = 1440;
const DESIGN_H = 820;
const fitScript = `(function(){var d=document.documentElement;function f(){var z=Math.min(innerWidth/${DESIGN_W},innerHeight/${DESIGN_H});z=Math.max(1,Math.min(z,3));d.style.zoom=z>1.01?String(z):"";}f();addEventListener("resize",f);})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: fitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
