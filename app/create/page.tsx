import type { Metadata } from "next";
import { CreateStudio } from "./CreateStudio";

export const metadata: Metadata = {
  title: "创作中心 — Plum",
  description: "创建角色、故事与互动世界。",
};

export default function CreatePage() {
  return <CreateStudio />;
}
