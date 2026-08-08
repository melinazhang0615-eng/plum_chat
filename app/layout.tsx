import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plum — 找到懂你的角色",
  description: "和有故事、有性格的 AI 角色自在聊天。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
