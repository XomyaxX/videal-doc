import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600", "700"],
});

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["cyrillic", "latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Видеал.Док",
  description: "Электронный документооборот ООО «Видеаль Медиа»",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Видеал.Док",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#16324f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${sans.variable} ${serif.variable} h-full`}>
      <body className="min-h-full paper-grid">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
