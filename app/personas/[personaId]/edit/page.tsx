import { PersonaEditor } from "../../persona-editor";

export default async function EditPersonaPage({ params }: { params: Promise<{ personaId: string }> }) {
  const { personaId } = await params;
  return <PersonaEditor personaId={personaId} />;
}
