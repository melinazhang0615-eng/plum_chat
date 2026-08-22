import type { Metadata } from "next";
import { Barlow } from "next/font/google";
import "./globals.css";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-barlow",
});

export const metadata: Metadata = {
  title: "Plum — 找到懂你的角色",
  description: "和有故事、有性格的 AI 角色自在聊天。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body className={barlow.variable}>{children}</body>
    </html>
  );
}
