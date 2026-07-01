import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Geist, Geist_Mono, Orbitron } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Jarvis HUD display faces. Orbitron drives the reactor numerals / wordmarks;
// Chakra Petch is the squared-off tactical face for HUD labels and telemetry.
const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const chakraPetch = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "JARVIS // Personal OS",
  description: "Command center.",
  // Apple-specific PWA hints. On iPadOS these let the app pin to the home
  // screen with our dark theme and a sensible status-bar treatment.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "JARVIS",
  },
};

// Viewport config lives separately from `metadata` per Next 14+ conventions.
// `viewport-fit: cover` + `dvh` units below let layouts flow under the iOS
// status bar and reflow when the software keyboard opens.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0c",
};

// Applied before first paint to prevent a flash of the wrong theme. This runs
// before React hydrates, so it cannot import lib/theme — the "jarvis-theme" key
// and the dark-is-default rule are duplicated here and MUST stay in sync with
// lib/theme.ts. Dark is the absence of the `light` class.
const themeInitScript = `(function(){try{if(localStorage.getItem('jarvis-theme')==='light'){document.documentElement.classList.add('light');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} ${chakraPetch.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
