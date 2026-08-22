import type { Metadata } from "next";
import { Barlow } from "next/font/google";
import { ClientTelemetry } from "@/components/client-telemetry";
import { PlumAuthProvider } from "@/components/plum-auth";
import "./globals.css";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-barlow",
});

export const metadata: Metadata = {
  title: "Plum — find a character who gets you",
  description: "Chat freely with AI characters who have a story and a personality.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // `lang` is what a screen reader picks a voice from and what a browser offers to translate,
    // so it has to match the words on the page — which are English everywhere now.
    <html lang="en" data-scroll-behavior="smooth">
      {/* The auth context lives in the layout so a client-side navigation keeps it
          mounted; mounting it per page refetched /auth/context on every route change. */}
      <body className={barlow.variable}>
        {/* Outside the auth provider on purpose: reporting has to survive auth being broken. */}
        <ClientTelemetry />
        <PlumAuthProvider>{children}</PlumAuthProvider>
      </body>
    </html>
  );
}
