"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { CommunityLink } from "@/components/community-link";
import { ApiError, deleteCreationWork, getBootstrap, listCreationWorks } from "@/lib/api";
import type { CreationWork } from "@/lib/api";
import styles from "./studio.module.css";

type StudioView = "all" | "drafts" | "published";

function CreateIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function statusLabel(work: CreationWork) {
  if (work.moderation_status === "approved") return "Published";
  if (work.moderation_status === "pending_review") return work.published_character_id ? "Changes under review" : "Under review";
  if (work.moderation_status === "rejected") return "Changes rejected";
  if (work.published_character_id) return "Unpublished changes";
  return "Draft";
}

export default function StudioPage() {
  const router = useRouter();
  const [items, setItems] = useState<CreationWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menuWorkId, setMenuWorkId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CreationWork | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useState<StudioView>("all");

  async function load() {
    setLoading(true); setError("");
    try {
      await getBootstrap();
      const result = await listCreationWorks();
      setItems(result.items);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        router.replace("/?login=1");
        return;
      }
      setError("Could not load My Studio. Try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView === "drafts" || requestedView === "published") setView(requestedView);
    void load();
  }, []);

  const draftItems = items.filter((work) => work.moderation_status !== "approved");
  const publishedItems = items.filter((work) => work.moderation_status === "approved");
  const visibleItems = view === "drafts" ? draftItems : view === "published" ? publishedItems : items;

  function selectView(nextView: StudioView) {
    setView(nextView);
    const url = new URL(window.location.href);
    if (nextView === "all") url.searchParams.delete("view");
    else url.searchParams.set("view", nextView);
    window.history.replaceState(null, "", url);
  }

  function openWork(work: CreationWork) {
    if (work.published_character_id) {
      router.push(`/chat/${work.published_character_id}`);
      return;
    }
    if (work.moderation_status !== "pending_review") {
      router.push(`/create?work_id=${encodeURIComponent(work.work_id)}`);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteCreationWork(deleteTarget.work_id);
      setItems((current) => current.filter((item) => item.work_id !== deleteTarget.work_id));
      setDeleteTarget(null);
    } catch {
      setError("Could not delete this Studio item. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return <main className={styles.shell}>
    <header className="site-header">
      <div className="header-brand-group"><Brand ariaLabel="Back to Plum home"/><CommunityLink/></div>
      <div className="site-header-actions"><button className="header-circle" aria-label="Create character" title="Create character" onClick={() => router.push("/create")}><CreateIcon /></button></div>
    </header>
    <section className={styles.heading}><div><span>CREATOR SPACE</span><h1>My Studio</h1><p>Manage drafts, review status, and published characters.</p></div></section>
    <nav className={styles.views} aria-label="Studio sections">
      <button className={view === "all" ? styles.active : ""} onClick={() => selectView("all")}><span>All works</span><b>{items.length}</b></button>
      <button className={view === "drafts" ? styles.active : ""} onClick={() => selectView("drafts")}><span>Draft Box</span><b>{draftItems.length}</b></button>
      <button className={view === "published" ? styles.active : ""} onClick={() => selectView("published")}><span>Published</span><b>{publishedItems.length}</b></button>
    </nav>
    {error && <div className={styles.error}>{error}<button onClick={() => void load()}>Retry</button></div>}
    {loading ? <div className={styles.empty}>Loading Studio…</div> : visibleItems.length === 0 ? <div className={styles.empty}><h2>{view === "drafts" ? "Draft Box is empty" : view === "published" ? "No published characters yet" : "Your Studio is empty"}</h2><p>{view === "drafts" ? "Save a draft or edit a published character to see it here." : view === "published" ? "Publish an approved character to see it here." : "Save a Creation draft to see it here."}</p><button onClick={() => router.push("/create")}>Create character</button></div> : <section className={styles.grid}>
      {visibleItems.map((work) => <article className={styles.card} key={work.work_id}>
        <button className={styles.cover} onClick={() => openWork(work)} disabled={work.moderation_status === "pending_review" && !work.published_character_id} aria-label={`${work.content.display_name || "Untitled character"} · ${statusLabel(work)}`}>
          {work.portrait_preview_url ? <img src={work.portrait_preview_url} alt=""/> : <span className={styles.placeholder}>No portrait</span>}
          <span className={styles.shade}/><span className={styles.copy}><strong>{work.content.display_name || "Untitled character"}</strong><small>{work.content.intro || "Continue editing this character."}</small></span>
        </button>
        <span className={`${styles.status} ${styles[work.moderation_status]}`}>{statusLabel(work)}</span>
        <div className={styles.more}>
          <button aria-label="More options" aria-expanded={menuWorkId === work.work_id} onClick={() => setMenuWorkId((current) => current === work.work_id ? null : work.work_id)}>•••</button>
          {menuWorkId === work.work_id && <div><button onClick={() => router.push(`/create?work_id=${encodeURIComponent(work.work_id)}`)}>Edit</button><button className={styles.deleteAction} onClick={() => { setMenuWorkId(null); setDeleteTarget(work); }}>Delete</button></div>}
        </div>
      </article>)}
    </section>}
    {deleteTarget && <div className={styles.backdrop} onMouseDown={() => !deleting && setDeleteTarget(null)}><section role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><span>DELETE CHARACTER</span><h2>Delete {deleteTarget.content.display_name || "this draft"}?</h2><p>{deleteTarget.moderation_status === "approved" ? "It will be removed from public discovery and no new chats can be started. Existing conversation history is retained." : "This draft will be removed from My Studio."}</p><footer><button disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</button><button disabled={deleting} className={styles.confirmDelete} onClick={() => void confirmDelete()}>{deleting ? "Deleting…" : "Delete"}</button></footer></section></div>}
  </main>;
}
