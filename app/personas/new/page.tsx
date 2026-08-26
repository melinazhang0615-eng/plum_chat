"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlumAuth } from "@/components/plum-auth";
import styles from "./persona-editor.module.css";

function safeReturnTo() {
  const value = new URLSearchParams(window.location.search).get("returnTo") || "/studio?section=personas";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/studio?section=personas";
}

export default function NewPersonaPage() {
  const router = useRouter();
  const { context, loading } = usePlumAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [notice, setNotice] = useState("");
  const member = context?.actor.kind === "member";

  useEffect(() => {
    if (!loading && !member) router.replace("/?login=1");
  }, [loading, member, router]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setNotice("Persona saving will be connected in the next step.");
  }

  if (loading || !member) return <main className={styles.loading}>Loading Persona editor…</main>;

  return <main className={styles.shell}>
    <header className={styles.header}>
      <button onClick={() => router.push(safeReturnTo())} aria-label="Back">←</button>
      <h1>Create a Persona</h1>
      <span aria-hidden="true" />
    </header>
    <form className={styles.form} onSubmit={submit}>
      <section className={styles.identity}>
        <div className={styles.avatar}>{(name.trim() || "P").slice(0, 1).toUpperCase()}<button type="button" onClick={() => setNotice("Avatar editing is coming next.")} aria-label="Change avatar">✎</button></div>
        <div><strong>{name.trim() || "Your Persona"}</strong><p>Show characters who you are in the story.</p></div>
      </section>

      <label className={styles.field}>
        <span><strong>Name</strong><small>What should characters call you?</small></span>
        <input value={name} maxLength={40} onChange={(event) => { setName(event.target.value); setNotice(""); }} placeholder="Enter a name" autoFocus />
        <em>{name.length}/40</em>
      </label>

      <label className={styles.field}>
        <span><strong>Description</strong><small>Optional · Share what characters should know about you.</small></span>
        <textarea value={description} maxLength={1000} onChange={(event) => { setDescription(event.target.value); setNotice(""); }} placeholder="Who are you in this story?" rows={6} />
        <em>{description.length}/1000</em>
      </label>

      <label className={styles.defaultCard}>
        <span><strong>Use as default Persona</strong><small>Apply this Persona to new conversations.</small></span>
        <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
        <i aria-hidden="true"><b /></i>
      </label>

      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <button className={styles.submit} type="submit" disabled={!name.trim()}>Create Persona</button>
    </form>
  </main>;
}
