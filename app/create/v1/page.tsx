import type { Metadata } from "next";
import { TipsyCreateV1 } from "./TipsyCreateV1";

export const metadata: Metadata = {
  title: "Create a Character — Plum",
  description: "Create and publish your Plum character.",
};

export default function CreateV1Page() {
  return <TipsyCreateV1 />;
}
