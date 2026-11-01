import type { Metadata } from "next";
import { Geist_Mono, Orbitron, Rajdhani } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { DEFAULT_THEME_ID, THEME_VARS_MAP } from "@/lib/themes";

const orbitron = Orbitron({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700", "800", "900"],
});

const rajdhani = Rajdhani({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "darpon.m4trix — Game Factory cyberpunk",
  description:
    "La fabbrica di videogiochi: crea giochi giocabili da uno script, edita mappe e livelli stile Godot/Unity, genera mondi procedurali e mondi 3D.",
  keywords: [
    "videogiochi",
    "game maker",
    "cyberpunk",
    "procedurale",
    "dungeon",
    "3D",
    "world builder",
  ],
  authors: [{ name: "darpon.m4trix" }],
  openGraph: {
    title: "darpon.m4trix — Game Factory cyberpunk",
    description: "Crea videogiochi completi da uno script, senza saper programmare.",
    siteName: "darpon.m4trix",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Anti-FOUC: applica il tema salvato PRIMA del primo paint
  const themeScript = `(function(){try{var m=${JSON.stringify(
    THEME_VARS_MAP
  )};var id=localStorage.getItem('mf_accent')||'${DEFAULT_THEME_ID}';var v=m[id]||m['${DEFAULT_THEME_ID}'];for(var k in v){document.documentElement.style.setProperty(k,v[k])}}catch(e){}})()`;

  return (
    <html lang="it" suppressHydrationWarning>
      <body
        className={`${orbitron.variable} ${rajdhani.variable} ${geistMono.variable} cp-scanlines antialiased bg-background text-foreground`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
        <Toaster
          richColors
          position="top-center"
          closeButton
          theme="dark"
          toastOptions={{
            style: {
              background: "#0b0f1c",
              border: "1px solid rgba(130,150,200,0.25)",
              color: "#e8ecf6",
            },
          }}
        />
      </body>
    </html>
  );
}
