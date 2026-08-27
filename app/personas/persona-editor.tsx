"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlumAuth } from "@/components/plum-auth";
import {
  ApiError,
  createPersona,
  getPersona,
  setDefaultPersona,
  updatePersona,
} from "@/lib/api";
import { errorMessage } from "@/lib/error-messages";
import type { Persona } from "@/lib/types";
import styles from "./persona-editor.module.css";

function safeReturnTo() {
  const fallback = "/studio?section=personas";
  const value = new URLSearchParams(window.location.search).get("returnTo") || fallback;
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export function PersonaEditor({ personaId }: { personaId?: string }) {
  const router = useRouter();
  const { context, loading: authLoading } = usePlumAuth();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(Boolean(personaId));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const member = context?.actor.kind === "member";

  useEffect(() => {
    if (!authLoading && !member) router.replace("/?login=1");
  }, [authLoading, member, router]);

  useEffect(() => {
    if (!member || !personaId) return;
    let active = true;
    getPersona(personaId)
      .then(({ persona: loaded }) => {
        if (!active) return;
        setPersona(loaded);
        setName(loaded.display_name);
        setDescription(loaded.description);
        setIsDefault(loaded.is_default);
      })
      .catch((loadError) => {
        if (!active) return;
        if (loadError instanceof ApiError && loadError.status === 401) {
          router.replace("/?login=1");
          return;
        }
        setError(errorMessage(loadError, { fallback: "Could not load this Persona. Try again." }));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [member, personaId, router]);

  const identityChanged = useMemo(() => (
    !persona
    || name.trim() !== persona.display_name
    || description.trim() !== persona.description
  ), [description, name, persona]);
  const defaultChanged = Boolean(persona && isDefault && !persona.is_default);
  const canSave = Boolean(
    name.trim()
    && !saving
    && (
      (!personaId && !persona)
      || (persona && ((!persona.is_locked && identityChanged) || defaultChanged))
    )
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      let saved: Persona;
      if (!persona) {
        saved = (await createPersona({
          display_name: name.trim(),
          description: description.trim(),
          is_default: isDefault,
        })).persona;
      } else {
        saved = persona;
        if (!persona.is_locked && identityChanged) {
          saved = (await updatePersona(persona.id, {
            display_name: name.trim(),
            description: description.trim(),
          })).persona;
        }
        if (isDefault && !saved.is_default) {
          saved = (await setDefaultPersona(saved.id)).persona;
        }
      }
      setPersona(saved);
      setNotice(persona ? "Persona saved." : "Persona created.");
      window.setTimeout(() => router.push(safeReturnTo()), 450);
    } catch (saveError) {
      setError(errorMessage(saveError, {
        fallback: "Could not save this Persona. Try again.",
        byStatus: { 409: "This Persona can no longer be edited. Refresh to see its latest state." },
      }));
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !member || loading) {
    return <main className={styles.loading}>Loading Persona editor…</main>;
  }
  if (personaId && !persona) {
    return <main className={styles.shell}>
      <header className={styles.header}>
        <button type="button" onClick={() => router.push(safeReturnTo())} aria-label="Back">←</button>
        <h1>Edit Persona</h1>
        <span aria-hidden="true" />
      </header>
      <section className={styles.errorState}>
        <h2>Persona unavailable</h2>
        <p>{error || "This Persona could not be loaded."}</p>
        <button type="button" onClick={() => router.push(safeReturnTo())}>Back to My Studio</button>
      </section>
    </main>;
  }

  return <main className={styles.shell}>
    <header className={styles.header}>
      <button type="button" onClick={() => router.push(safeReturnTo())} aria-label="Back">←</button>
      <h1>{persona ? "Edit Persona" : "Create a Persona"}</h1>
      <span aria-hidden="true" />
    </header>
    <form className={styles.form} onSubmit={submit}>
      <section className={styles.identity}>
        <div className={styles.avatar}>{(name.trim() || "P").slice(0, 1).toUpperCase()}</div>
        <div>
          <strong>{name.trim() || "Your Persona"}</strong>
          <p>Show characters who you are in the story.</p>
        </div>
      </section>

      {persona?.is_locked && <p className={styles.notice}>
        This Persona is already part of a story, so its identity is locked. You can still make it your default for new stories.
      </p>}

      <label className={styles.field}>
        <span><strong>Name</strong><small>What should characters call you?</small></span>
        <input value={name} maxLength={40} disabled={persona?.is_locked} onChange={(event) => { setName(event.target.value); setError(""); setNotice(""); }} placeholder="Enter a name" autoFocus={!personaId} />
        <em>{name.length}/40</em>
      </label>

      <label className={styles.field}>
        <span><strong>Description</strong><small>Optional · Share what characters should know about you.</small></span>
        <textarea value={description} maxLength={1000} disabled={persona?.is_locked} onChange={(event) => { setDescription(event.target.value); setError(""); setNotice(""); }} placeholder="Who are you in this story?" rows={6} />
        <em>{description.length}/1000</em>
      </label>

      <label className={styles.defaultCard}>
        <span><strong>Use as default Persona</strong><small>{persona?.is_default ? "Used automatically for new stories. Choose another Persona to change your default." : "Apply this Persona to new stories."}</small></span>
        <input type="checkbox" checked={isDefault} disabled={persona?.is_default} onChange={(event) => { setIsDefault(event.target.checked); setNotice(""); }} />
        <i aria-hidden="true"><b /></i>
      </label>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <button className={styles.submit} type="submit" disabled={!canSave}>{saving ? "Saving…" : persona ? "Save Persona" : "Create Persona"}</button>
    </form>
  </main>;
}
