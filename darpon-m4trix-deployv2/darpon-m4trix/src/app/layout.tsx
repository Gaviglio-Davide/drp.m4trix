import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { DEFAULT_THEME_ID, THEME_VARS_MAP } from "@/lib/themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "darpon.m4trix — Crea mondi 3D e giocaci dentro",
  description:
    "L'hub per creare videogiochi: costruisci mondi 3D con un clic, personalizza i modelli ed esploraci dentro.",
  keywords: ["3D", "videogiochi", "world builder", "crea mondi", "Three.js"],
  authors: [{ name: "darpon.m4trix" }],
  openGraph: {
    title: "darpon.m4trix — Crea mondi 3D e giocaci dentro",
    description: "L'hub per creare videogiochi in 3D",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
        <Toaster richColors position="top-center" closeButton />
      </body>
    </html>
  );
}
