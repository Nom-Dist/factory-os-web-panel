import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "FactoryOS — Kontrol merkezi", description: "OpenComputers ve AE2 için canlı fabrika kontrol paneli." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>;
}
