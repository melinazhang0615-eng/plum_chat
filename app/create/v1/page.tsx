import type { Metadata } from "next";
import { CreateAccessGate } from "../CreateAccessGate";

export const metadata: Metadata = {
  title: "Create a Character — Plum",
  description: "Create and publish your Plum character.",
};

export default function CreateV1Page() {
  return <CreateAccessGate />;
}
