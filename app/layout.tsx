import type { Metadata } from "next";
import { PlumAuthProvider } from "@/components/plum-auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plum — 找到懂你的角色",
  description: "和有故事、有性格的 AI 角色自在聊天。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      {/* The auth context lives in the layout so a client-side navigation keeps it
          mounted; mounting it per page refetched /auth/context on every route change. */}
      <body><PlumAuthProvider>{children}</PlumAuthProvider></body>
    </html>
  );
}
