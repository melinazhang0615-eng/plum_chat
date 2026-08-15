import type { Metadata } from "next";
import { CreateCharacterV1 } from "./CreateCharacterV1";

export const metadata: Metadata = {
  title: "Create a Character — Plum",
  description: "Create and publish your Plum character.",
};

export default function CreateV1Page() {
  return <CreateCharacterV1 />;
}
