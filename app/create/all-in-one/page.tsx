import type { Metadata } from "next";
import { AllInOneCreate } from "./AllInOneCreate";

export const metadata: Metadata = {
  title: "单页创作工作台 — Plum",
  description: "在一个页面中创建角色、故事与互动世界。",
};

export default function AllInOneCreatePage() {
  return <AllInOneCreate />;
}
