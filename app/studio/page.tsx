"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { AccountDropdown } from "@/components/account-dropdown";
import { CommunityLink } from "@/components/community-link";
import { CloseIcon, CopyIcon, CreateIcon, DeleteIcon, EditIcon, PersonaIcon, SearchIcon, ShareIcon, TranslationIcon } from "@/components/icons";
import { ApiError, deleteCreationWork, deletePersona, getBootstrap, listCreationWorks, listPersonas, logout, setDefaultPersona } from "@/lib/api";
import type { CreationWork } from "@/lib/api";
import { HEADER_LABELS, LANGUAGE_MENU, WALLET_PANEL } from "@/lib/copy";
import { shareCharacter } from "@/lib/character-share";
import { errorMessage } from "@/lib/error-messages";
import { formatCoins } from "@/lib/format";
import type { AuthUser, Persona } from "@/lib/types";
import styles from "./studio.module.css";

type StudioView = "all" | "drafts" | "published";
type StudioSection = "characters" | "personas";
const STUDIO_SECTIONS: { id: StudioSection; label: string }[] = [
  { id: "characters", label: "Characters" },
  { id: "personas", label: "Personas" },
];
const PROFILE_NAME_KEY = "plum_profile_display_name";

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
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [personaError, setPersonaError] = useState("");
  const [menuWorkId, setMenuWorkId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CreationWork | null>(null);
  const [personaDeleteTarget, setPersonaDeleteTarget] = useState<Persona | null>(null);
  const [personaBusyId, setPersonaBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [section, setSection] = useState<StudioSection>("characters");
  const [view, setView] = useState<StudioView>("all");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [balance, setBalance] = useState(0);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [uidCopied, setUidCopied] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [shareNotice, setShareNotice] = useState("");

  async function load() {
    setLoading(true); setError(""); setPersonaError("");
    try {
      const bootstrap = await getBootstrap();
      setUser(bootstrap.user);
      setProfileName(window.localStorage.getItem(PROFILE_NAME_KEY) || bootstrap.user.display_name);
      setBalance(bootstrap.wallet.balance);
      const [worksResult, personasResult] = await Promise.allSettled([listCreationWorks(), listPersonas()]);
      const unauthorized = [worksResult, personasResult].find(
        (result) => result.status === "rejected" && result.reason instanceof ApiError && result.reason.status === 401,
      );
      if (unauthorized?.status === "rejected") throw unauthorized.reason;
      if (worksResult.status === "fulfilled") setItems(worksResult.value.items);
      else setError(errorMessage(worksResult.reason, { fallback: "Could not load your characters. Try again." }));
      if (personasResult.status === "fulfilled") setPersonas(personasResult.value.items);
      else setPersonaError(errorMessage(personasResult.reason, { fallback: "Could not load your Personas. Try again." }));
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        router.replace("/?login=1");
        return;
      }
      setError(errorMessage(loadError, { fallback: "Could not load My Studio. Try again." }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedSection = query.get("section");
    const requestedView = query.get("view");
    if (requestedSection === "personas") setSection("personas");
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

  function selectSection(nextSection: StudioSection) {
    setSection(nextSection);
    const url = new URL(window.location.href);
    if (nextSection === "characters") url.searchParams.delete("section");
    else url.searchParams.set("section", nextSection);
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
    } catch (deleteError) {
      setError(errorMessage(deleteError, { fallback: "Could not delete this Studio item. Try again." }));
    } finally {
      setDeleting(false);
    }
  }

  async function makePersonaDefault(persona: Persona) {
    if (persona.is_default || personaBusyId) return;
    setPersonaBusyId(persona.id);
    setPersonaError("");
    try {
      const { persona: selected } = await setDefaultPersona(persona.id);
      setPersonas((current) => current
        .map((item) => ({ ...item, is_default: item.id === selected.id }))
        .sort((left, right) => Number(right.is_default) - Number(left.is_default)));
    } catch (personaError) {
      setPersonaError(errorMessage(personaError, { fallback: "Could not change your default Persona. Try again." }));
    } finally {
      setPersonaBusyId(null);
    }
  }

  async function confirmPersonaDelete() {
    if (!personaDeleteTarget || personaBusyId) return;
    const personaId = personaDeleteTarget.id;
    setPersonaBusyId(personaId);
    setPersonaError("");
    try {
      await deletePersona(personaId);
      setPersonas((current) => current.filter((item) => item.id !== personaId));
      setPersonaDeleteTarget(null);
    } catch (personaError) {
      setPersonaDeleteTarget(null);
      setPersonaError(errorMessage(personaError, { fallback: "Could not delete this Persona. Try again." }));
    } finally {
      setPersonaBusyId(null);
    }
  }

  async function signOut() {
    try { await logout(); } catch { /* An expired session is already signed out. */ }
    setUser(null);
    setBalance(0);
    setAccountOpen(false);
    router.replace("/");
  }

  async function copyUid() {
    if (!user?.id) return;
    try {
      await navigator.clipboard.writeText(user.id);
      setUidCopied(true);
      window.setTimeout(() => setUidCopied(false), 1800);
    } catch { setUidCopied(false); }
  }

  async function shareWork(work: CreationWork) {
    const characterId = work.published_character_id;
    if (!characterId) return;
    try {
      const result = await shareCharacter({
        characterId,
        title: work.content.display_name || "Plum character",
        text: work.content.intro || "A character on Plum",
      });
      if (result === "copied") setShareNotice("Link copied");
      if (result === "dismissed") return;
    } catch {
      setShareNotice("Could not share this character");
    }
    window.setTimeout(() => setShareNotice(""), 2200);
  }

  function saveProfile(event: FormEvent) {
    event.preventDefault();
    const value = profileName.trim();
    if (!value) return;
    window.localStorage.setItem(PROFILE_NAME_KEY, value);
    setProfileName(value);
    setProfileSaved(true);
  }

  return <main className={styles.shell}>
    <header className="site-header">
      <div className="header-brand-group"><Brand ariaLabel="Back to Plum home"/><CommunityLink/></div>
      <div className="site-header-actions">
        <button className="header-circle" aria-label={HEADER_LABELS.search} onClick={() => router.push("/?search=1")}><SearchIcon /></button>
        <button className="header-circle" aria-label={HEADER_LABELS.create} title={HEADER_LABELS.create} onClick={() => router.push("/create")}><CreateIcon /></button>
        <div className="header-menu-wrap">
          <button className="header-circle language-symbol" aria-label={HEADER_LABELS.language} aria-expanded={languageOpen} onClick={() => setLanguageOpen((open) => !open)}><TranslationIcon /></button>
          {languageOpen && <div className="header-dropdown language-menu"><button className="selected">{LANGUAGE_MENU.english} <span>✓</span></button><button>{LANGUAGE_MENU.chinese}</button><small>{LANGUAGE_MENU.note}</small></div>}
        </div>
        {user && <div className="header-menu-wrap">
          <button className="coin-button" onClick={() => setWalletOpen((open) => !open)} aria-label={HEADER_LABELS.coinBalance(formatCoins(balance))}><span>✦</span><strong>{formatCoins(balance)}</strong></button>
          {walletOpen && <div className="header-dropdown wallet-panel"><small>{WALLET_PANEL.balance}</small><strong>{formatCoins(balance)}</strong><h3>{WALLET_PANEL.history}</h3><p>{WALLET_PANEL.empty}</p><button disabled>{WALLET_PANEL.topUp}</button></div>}
        </div>}
        {user && <AccountDropdown user={user} active="studio" open={accountOpen} onToggle={() => setAccountOpen((open) => !open)} onSignOut={() => void signOut()} />}
      </div>
    </header>
    <section className="studio-profile-hero account-profile-hero">
      <div className="studio-profile-avatar-column"><div className="account-avatar-large">{(profileName || user?.display_name || "P").slice(0, 1).toUpperCase()}</div></div>
      <div className="studio-profile-main"><h1>{profileName || user?.display_name}</h1><p className="studio-uid-line">UID: {user?.id}<button className="studio-uid-copy" onClick={() => void copyUid()} aria-label="Copy UID" title={uidCopied ? "Copied" : "Copy UID"}><CopyIcon /></button><small>{uidCopied ? "Copied" : ""}</small></p><div className="studio-profile-stats"><span><strong>{items.length}</strong> Works</span><span><strong>{publishedItems.length}</strong> Published</span><span><strong>{formatCoins(balance)}</strong> Coins</span></div></div>
      <div className="studio-profile-actions"><button className="account-primary-button" onClick={() => { setProfileEditing(true); setProfileSaved(false); }}>Edit Profile</button></div>
    </section>
    {profileEditing && <div className="studio-profile-modal-backdrop" onMouseDown={() => setProfileEditing(false)}><section className="studio-profile-modal" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title" onMouseDown={(event) => event.stopPropagation()}><button className="studio-profile-modal-close" onClick={() => setProfileEditing(false)} aria-label="Close edit profile"><CloseIcon /></button><form className="account-form" onSubmit={saveProfile}><div className="account-section-heading"><div><h2 id="edit-profile-title">Edit Profile</h2><p>Profile sync will connect to your account after the profile API is available.</p></div></div><div className="account-edit-avatar">{profileName.slice(0, 1).toUpperCase()}</div><label>Display name<input value={profileName} maxLength={40} onChange={(event) => { setProfileName(event.target.value); setProfileSaved(false); }} /></label><label>Account ID<input value={user?.id || ""} readOnly /></label><div className="account-form-actions"><button type="button" className="account-secondary-button" onClick={() => setProfileEditing(false)}>Cancel</button><button className="account-primary-button" type="submit" disabled={!profileName.trim()}>Save changes</button>{profileSaved && <span className="account-save-note">Saved on this device</span>}</div></form></section></div>}
    <section className={styles.heading}><div><span>CREATOR SPACE</span><h1>My Studio</h1><p>Manage everything you create and use in your stories.</p></div></section>
    <nav className={styles.sections} aria-label="My Studio">
      {STUDIO_SECTIONS.map((item) => <button key={item.id} className={section === item.id ? styles.active : ""} onClick={() => selectSection(item.id)}>{item.label}</button>)}
    </nav>
    {section === "characters" && error && <div className={styles.error}>{error}<button onClick={() => void load()}>Retry</button></div>}
    {section === "personas" && personaError && <div className={styles.error}>{personaError}<button onClick={() => void load()}>Retry</button></div>}
    {section === "characters" ? <><nav className={styles.views} aria-label="Character sections">
      <button className={view === "all" ? styles.active : ""} onClick={() => selectView("all")}><span>All works</span><b>{items.length}</b></button>
      <button className={view === "drafts" ? styles.active : ""} onClick={() => selectView("drafts")}><span>Draft Box</span><b>{draftItems.length}</b></button>
      <button className={view === "published" ? styles.active : ""} onClick={() => selectView("published")}><span>Published</span><b>{publishedItems.length}</b></button>
    </nav>
    {loading ? <div className={styles.empty}>Loading Studio…</div> : visibleItems.length === 0 ? <div className={styles.empty}><h2>{view === "drafts" ? "Draft Box is empty" : view === "published" ? "No published characters yet" : "Your Studio is empty"}</h2><p>{view === "drafts" ? "Save a draft or edit a published character to see it here." : view === "published" ? "Publish an approved character to see it here." : "Save a Creation draft to see it here."}</p><button onClick={() => router.push("/create")}>Create character</button></div> : <section className={styles.grid}>
      {visibleItems.map((work) => <article className={styles.card} key={work.work_id}>
        <button className={styles.cover} onClick={() => openWork(work)} disabled={work.moderation_status === "pending_review" && !work.published_character_id} aria-label={`${work.content.display_name || "Untitled character"} · ${statusLabel(work)}`}>
          {work.portrait_preview_url ? <img src={work.portrait_preview_url} alt=""/> : <span className={styles.placeholder}>No portrait</span>}
          <span className={styles.shade}/><span className={styles.copy}><strong>{work.content.display_name || "Untitled character"}</strong><small>{work.content.intro || "Continue editing this character."}</small></span>
        </button>
        <span className={`${styles.status} ${styles[work.moderation_status]}`}>{statusLabel(work)}</span>
        <div className={styles.more}>
          <button aria-label="More options" aria-expanded={menuWorkId === work.work_id} onClick={() => setMenuWorkId((current) => current === work.work_id ? null : work.work_id)}>•••</button>
          {menuWorkId === work.work_id && <div><button onClick={() => router.push(`/create?work_id=${encodeURIComponent(work.work_id)}`)}><EditIcon />Edit</button>{work.published_character_id && <button onClick={() => { setMenuWorkId(null); void shareWork(work); }}><ShareIcon />Share</button>}<button className={styles.deleteAction} onClick={() => { setMenuWorkId(null); setDeleteTarget(work); }}><DeleteIcon />Delete</button></div>}
        </div>
      </article>)}
    </section>}</> : loading ? <div className={styles.empty}>Loading Personas…</div> : <section className={styles.personaSection}>
      <header className={styles.personaHeader}>
        <div><h2>Your Personas</h2><p>Choose who you are when you step into a story.</p></div>
        <button onClick={() => router.push(`/personas/new?returnTo=${encodeURIComponent("/studio?section=personas")}`)}>Create Persona</button>
      </header>
      {personas.length === 0 ? <div className={styles.personas}>
        <PersonaIcon />
        <h2>Create your first Persona</h2>
        <p>Give characters a name and a little context about who you are.</p>
        <button onClick={() => router.push(`/personas/new?returnTo=${encodeURIComponent("/studio?section=personas")}`)}>Create Persona</button>
      </div> : <div className={styles.personaGrid}>{personas.map((persona) => <article className={styles.personaCard} key={persona.id}>
        <div className={styles.personaAvatar}>{persona.display_name.slice(0, 1).toUpperCase()}</div>
        <div className={styles.personaDetails}>
          <div><h3>{persona.display_name}</h3>{persona.is_default && <span>Default</span>}</div>
          <p>{persona.description || "No description yet."}</p>
          {persona.is_locked && <small>Used in a story · identity locked</small>}
        </div>
        <div className={styles.personaActions}>
          {!persona.is_default && <button disabled={personaBusyId !== null} onClick={() => void makePersonaDefault(persona)}>{personaBusyId === persona.id ? "Saving…" : "Make default"}</button>}
          <button onClick={() => router.push(`/personas/${encodeURIComponent(persona.id)}/edit?returnTo=${encodeURIComponent("/studio?section=personas")}`)}><EditIcon />{persona.is_locked ? "View" : "Edit"}</button>
          <button className={styles.personaDelete} disabled={persona.is_default || persona.is_locked || personaBusyId !== null} title={persona.is_default ? "Choose another default Persona first" : persona.is_locked ? "A Persona used in a story cannot be deleted" : "Delete Persona"} onClick={() => setPersonaDeleteTarget(persona)}><DeleteIcon />Delete</button>
        </div>
      </article>)}</div>}
    </section>}
    {shareNotice && <div className={styles.shareNotice} role="status">{shareNotice}</div>}
    {deleteTarget && <div className={styles.backdrop} onMouseDown={() => !deleting && setDeleteTarget(null)}><section role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><span>DELETE CHARACTER</span><h2>Delete {deleteTarget.content.display_name || "this draft"}?</h2><p>{deleteTarget.moderation_status === "approved" ? "It will be removed from public discovery and no new chats can be started. Existing conversation history is retained." : "This draft will be removed from My Studio."}</p><footer><button disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</button><button disabled={deleting} className={styles.confirmDelete} onClick={() => void confirmDelete()}>{deleting ? "Deleting…" : "Delete"}</button></footer></section></div>}
    {personaDeleteTarget && <div className={styles.backdrop} onMouseDown={() => !personaBusyId && setPersonaDeleteTarget(null)}><section role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><span>DELETE PERSONA</span><h2>Delete {personaDeleteTarget.display_name}?</h2><p>This removes the Persona from My Studio. This cannot be undone.</p><footer><button disabled={Boolean(personaBusyId)} onClick={() => setPersonaDeleteTarget(null)}>Cancel</button><button disabled={Boolean(personaBusyId)} className={styles.confirmDelete} onClick={() => void confirmPersonaDelete()}>{personaBusyId ? "Deleting…" : "Delete"}</button></footer></section></div>}
  </main>;
}
