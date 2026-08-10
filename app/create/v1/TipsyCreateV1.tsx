"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Brand, CoinBadge } from "@/components/brand";
import { ApiError, uploadCreatorPortrait } from "@/lib/api";
import styles from "./tipsy-v1.module.css";

type Rating = "Limited" | "Limitless";
type Visibility = "Public" | "Private";
type ImportKind = "json" | "txt" | "novel";
type TextTarget = "settings" | "intro" | "opening" | "examples";
type Gender = "" | "male" | "female" | "non_binary";

type CharacterDraft = {
  name: string;
  gender: Gender;
  intro: string;
  opening: string;
  characterSettings: string;
  examples: string;
  replyRules: string;
  image: string;
  portraitMediaId: string;
  avatarPositionX: number;
  avatarPositionY: number;
  rating: Rating;
  visibility: Visibility;
  tags: string[];
  adultConfirmed: boolean;
  rightsConfirmed: boolean;
};

type ImportResult = {
  kind: ImportKind;
  fileName: string;
  raw: string;
  mapped?: Partial<CharacterDraft>;
  summary: string;
};

const STORAGE_KEY = "plum.create.v1.single-character";
const TAG_OPTIONS: readonly string[] = [];
const PORTRAIT_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif";

const EMPTY_DRAFT: CharacterDraft = {
  name: "",
  gender: "",
  intro: "",
  opening: "",
  characterSettings: "",
  examples: "",
  replyRules: "",
  image: "",
  portraitMediaId: "",
  avatarPositionX: 50,
  avatarPositionY: 50,
  rating: "Limited",
  visibility: "Public",
  tags: [],
  adultConfirmed: false,
  rightsConfirmed: false,
};

function Icon({ name }: { name: "upload" | "file" | "book" | "save" | "reset" | "box" | "arrow" | "close" | "check" | "info" | "eye" }) {
  const paths: Record<string, React.ReactNode> = {
    upload: <><path d="M12 16V4M8 8l4-4 4 4"/><path d="M4 15v4h16v-4"/></>,
    file: <><path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21V5.5ZM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5A2.5 2.5 0 0 1 20 21V5.5Z"/></>,
    save: <><path d="M5 3h12l2 2v16H5V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>,
    reset: <><path d="M4 9V4h5"/><path d="M5 5a8 8 0 1 1-1 9"/></>,
    box: <><path d="M4 8h16v12H4V8ZM7 4h10l2 4H5l2-4Z"/><path d="M9 12h6"/></>,
    arrow: <path d="m9 6 6 6-6 6"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></>,
    eye: <><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function Field({ label, required, hint, count, children }: { label: string; required?: boolean; hint?: string; count?: string; children: React.ReactNode }) {
  return <label className={styles.field}>
    <span className={styles.labelRow}><b>{label}{required && <i>*</i>}</b>{count && <small>{count}</small>}</span>
    {hint && <span className={styles.fieldHint}>{hint}</span>}
    {children}
  </label>;
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readTags(value: unknown) {
  const values = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : safeText(value).split(/[,，]/);
  return [...new Set(values.map((tag) => tag.trim()).filter(Boolean))].slice(0, 5);
}

function normalizeGender(value: unknown): Gender {
  if (value === "male" || value === "男性") return "male";
  if (value === "female" || value === "女性") return "female";
  if (value === "non_binary" || value === "非二元") return "non_binary";
  return "";
}

function normalizePosition(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 50;
}

function portraitUploadError(error: unknown) {
  if (!(error instanceof ApiError)) return "Could not upload this portrait. Please try again.";
  if (error.status === 401) return "Sign in before uploading a character portrait.";
  if (error.message === "media_too_large") return "This image is too large. Choose a smaller file.";
  if (error.message === "media_kind_unsupported") return "Use a JPG, PNG, WebP, HEIC, or HEIF image.";
  if (error.message === "media_decode_failed") return "This image could not be read. Try exporting it again.";
  if (error.message === "rate_limited") return "Too many uploads. Wait a moment and try again.";
  return "Could not upload this portrait. Please try again.";
}

function mapTavernCard(raw: unknown): Partial<CharacterDraft> {
  if (!raw || typeof raw !== "object") throw new Error("The JSON root must be an object");
  const root = raw as Record<string, unknown>;
  const source = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  const personality = safeText(source.personality);
  const scenario = safeText(source.scenario);
  const systemPrompt = safeText(source.system_prompt);
  const postHistory = safeText(source.post_history_instructions);
  const characterSettings = [
    safeText(source.description),
    personality && `Personality: ${personality}`,
    scenario && `Scenario: ${scenario}`,
  ].filter(Boolean).join("\n\n");
  return {
    name: safeText(source.name),
    intro: safeText(source.description),
    opening: safeText(source.first_mes) || safeText(source.greeting),
    characterSettings,
    examples: safeText(source.mes_example),
    replyRules: [systemPrompt, postHistory].filter(Boolean).join("\n\n"),
    tags: readTags(source.tags),
  };
}

export function TipsyCreateV1() {
  const [draft, setDraft] = useState<CharacterDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState(true);
  const [toast, setToast] = useState("");
  const [dialog, setDialog] = useState<"reset" | "created" | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [textTarget, setTextTarget] = useState<TextTarget>("settings");
  const [importOpen, setImportOpen] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarDrag = useRef<{ pointerId: number; startX: number; startY: number; positionX: number; positionY: number; width: number; height: number } | null>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const txtInput = useRef<HTMLInputElement>(null);
  const novelInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<CharacterDraft> & { description?: string; background?: string };
        setDraft({
          ...EMPTY_DRAFT,
          ...parsed,
          gender: normalizeGender(parsed.gender),
          tags: readTags(parsed.tags),
          intro: safeText(parsed.intro) || safeText(parsed.description),
          characterSettings: safeText(parsed.characterSettings) || safeText(parsed.background),
          avatarPositionX: normalizePosition(parsed.avatarPositionX),
          avatarPositionY: normalizePosition(parsed.avatarPositionY),
        });
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setSaved(false);
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      setSaved(true);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, hydrated]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const tags = draft.tags.slice(0, 5);
  const previewCover = draft.image || "/characters/luna.svg";
  const canCreate = Boolean(
    draft.name.trim()
    && draft.gender
    && draft.image
    && draft.intro.trim()
    && draft.opening.trim()
    && draft.characterSettings.trim()
    && draft.tags.length > 0
    && draft.rating
    && draft.visibility
    && draft.adultConfirmed
    && draft.rightsConfirmed
  );

  function update(patch: Partial<CharacterDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function toggleTag(tag: string) {
    setDraft((current) => current.tags.includes(tag)
      ? { ...current, tags: current.tags.filter((item) => item !== tag) }
      : current.tags.length < 5 ? { ...current, tags: [...current.tags, tag] } : current);
  }

  function removeTag(tag: string) {
    update({ tags: draft.tags.filter((item) => item !== tag) });
  }

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }

  function saveNow() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setSaved(true);
    showToast("Draft saved in this browser");
  }

  function resetDraft() {
    setDraft(EMPTY_DRAFT);
    setImportResult(null);
    window.localStorage.removeItem(STORAGE_KEY);
    setDialog(null);
    showToast("Draft reset");
  }

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploadingImage) return;
    setUploadingImage(true);
    try {
      const { media } = await uploadCreatorPortrait(file);
      update({
        image: media.preview_url,
        portraitMediaId: media.media_id,
        avatarPositionX: 50,
        avatarPositionY: 50,
      });
      showToast("Character portrait uploaded");
    } catch (error) {
      showToast(portraitUploadError(error));
    } finally {
      setUploadingImage(false);
    }
  }

  function startAvatarDrag(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    avatarDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      positionX: draft.avatarPositionX,
      positionY: draft.avatarPositionY,
      width: bounds.width,
      height: bounds.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveAvatar(event: React.PointerEvent<HTMLDivElement>) {
    const drag = avatarDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    update({
      avatarPositionX: Math.min(100, Math.max(0, drag.positionX - ((event.clientX - drag.startX) / drag.width) * 100)),
      avatarPositionY: Math.min(100, Math.max(0, drag.positionY - ((event.clientY - drag.startY) / drag.height) * 100)),
    });
  }

  function finishAvatarDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (avatarDrag.current?.pointerId !== event.pointerId) return;
    avatarDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function moveAvatarWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    update({
      avatarPositionX: Math.min(100, Math.max(0, draft.avatarPositionX + offset[0])),
      avatarPositionY: Math.min(100, Math.max(0, draft.avatarPositionY + offset[1])),
    });
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>, kind: ImportKind) {
    setImportOpen(false);
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1_500_000) {
      showToast("This prototype supports text files up to 1.5 MB");
      return;
    }
    try {
      const raw = await file.text();
      if (kind === "json") {
        const mapped = mapTavernCard(JSON.parse(raw) as unknown);
        const mappedCount = Object.values(mapped).filter(Boolean).length;
        setImportResult({ kind, fileName: file.name, raw, mapped, summary: `${mappedCount} fields can be mapped. Review them before applying.` });
      } else if (kind === "novel") {
        const paragraphs = raw.split(/\n\s*\n/).filter((part) => part.trim()).length;
        setImportResult({ kind, fileName: file.name, raw, summary: `Read ${raw.length.toLocaleString("en-US")} characters and about ${paragraphs} paragraphs locally.` });
      } else {
        setImportResult({ kind, fileName: file.name, raw, summary: `Read ${raw.length.toLocaleString("en-US")} characters. Choose where to place the text.` });
      }
    } catch (error) {
      showToast(error instanceof Error ? `Import failed: ${error.message}` : "Could not read the file");
    }
  }

  function applyImport() {
    if (!importResult) return;
    if (importResult.kind === "json" && importResult.mapped) {
      const clean = Object.fromEntries(Object.entries(importResult.mapped).filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value))) as Partial<CharacterDraft>;
      update(clean);
      showToast("Character card fields added to the form");
    } else if (importResult.kind === "txt") {
      const targetMap: Record<TextTarget, keyof CharacterDraft> = {
        settings: "characterSettings", intro: "intro", opening: "opening", examples: "examples",
      };
      update({ [targetMap[textTarget]]: importResult.raw });
      showToast("TXT content added to the selected field");
    }
    setImportResult(null);
  }

  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <div className={styles.brandGroup}><Brand ariaLabel="Back to Plum home"/><span>CREATE</span></div>
      <nav><Link href="/create">Requirements</Link><Link href="/create/all-in-one">Research prototype</Link><span className={styles.saveStatus}><i className={saved ? styles.saved : ""}/>{saved ? "Auto-saved" : "Saving…"}</span><CoinBadge balance={1280} compact title="Mock coin balance" label="Coins"/></nav>
    </header>

    <section className={styles.pageIntro}>
      <div><span>CREATE CHARACTER</span><h1>Create a character worth meeting</h1><p>Start with a name, then shape the look and story—or import something you already have.</p></div>
      <div className={styles.pageIntroActions}>
        <div className={styles.importMenuWrap}>
          <button className={styles.importEntryButton} onClick={() => setImportOpen((open) => !open)} aria-expanded={importOpen} aria-label="Import existing content"><Icon name="upload"/>Import existing content</button>
          {importOpen && <section className={styles.importPopover} aria-label="Import existing content">
            <header><div><small>IMPORT</small><h2>Start from existing content</h2></div><button onClick={() => setImportOpen(false)} aria-label="Close import menu"><Icon name="close"/></button></header>
            <p>A Tavern card, text file, or novel can become your starting point.</p>
            <div className={styles.importPopoverActions}>
              <button onClick={() => jsonInput.current?.click()}><Icon name="file"/><span><b>Tavern JSON</b><small>Map character fields automatically</small></span><Icon name="arrow"/></button>
              <button onClick={() => txtInput.current?.click()}><Icon name="upload"/><span><b>TXT file</b><small>Choose where to place the text</small></span><Icon name="arrow"/></button>
              <button className={styles.novelImport} onClick={() => novelInput.current?.click()}><Icon name="book"/><span><b>A novel <i>ROADMAP</i></b><small>Local-read demo only</small></span><Icon name="arrow"/></button>
            </div>
            <div className={styles.importPrivacy}><Icon name="info"/><span>Files are read only in this browser and are never uploaded.</span></div>
            <input ref={jsonInput} className={styles.hiddenInput} type="file" accept=".json,application/json" onChange={(event) => handleImport(event, "json")}/>
            <input ref={txtInput} className={styles.hiddenInput} type="file" accept=".txt,text/plain" onChange={(event) => handleImport(event, "txt")}/>
            <input ref={novelInput} className={styles.hiddenInput} type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => handleImport(event, "novel")}/>
          </section>}
        </div>
      </div>
    </section>
    {importOpen && <button className={styles.importMenuBackdrop} aria-label="Dismiss import menu" onClick={() => setImportOpen(false)}/>}

    <section className={styles.workspace}>
      <div className={styles.editorColumn}>
        <div className={styles.editorScroll}>
          <section className={styles.formSection}>
            <header className={styles.sectionTitle}><div><span>01</span><h2>Meet your character</h2></div></header>
            <div className={styles.twoColumns}>
              <Field label="Name" required count={`${draft.name.length}/50`}><input value={draft.name} maxLength={50} placeholder="Enter a character name" onChange={(event) => update({ name: event.target.value })}/></Field>
              <Field label="Gender" required><select value={draft.gender} onChange={(event) => update({ gender: event.target.value as Gender })}><option value="" disabled>Select gender</option><option value="male">Male</option><option value="female">Female</option><option value="non_binary">Non-binary</option></select></Field>
            </div>
          </section>

          <section className={styles.formSection}>
            <header className={styles.sectionTitle}><div><span>02</span><h2>Create the character look<i className={styles.requiredMark}>*</i></h2></div></header>
            {!draft.image ? (
              <label className={styles.imageDropzone} aria-busy={uploadingImage}>
                <Icon name="upload"/>
                <span><b>{uploadingImage ? "Uploading and preparing portrait…" : "Upload character portrait"}</b><small>JPG, PNG, WebP, HEIC, or HEIF · Portrait orientation recommended</small></span>
                <input type="file" accept={PORTRAIT_ACCEPT} disabled={uploadingImage} onChange={handleImage}/>
              </label>
            ) : (
              <div className={styles.uploadedImageGrid}>
                <section className={styles.portraitPreview}>
                  <header><b>Character portrait</b><small>Used for the cover and full character image</small></header>
                  <div><img src={draft.image} alt="Uploaded character portrait"/></div>
                  <label aria-busy={uploadingImage}><Icon name="upload"/>{uploadingImage ? "Uploading…" : "Replace portrait"}<input type="file" accept={PORTRAIT_ACCEPT} disabled={uploadingImage} onChange={handleImage}/></label>
                </section>
                <section className={styles.avatarPreview}>
                  <header><b>Character avatar</b><small>Shown beside the character in profile and chat surfaces</small></header>
                  <div
                    className={styles.avatarCrop}
                    role="group"
                    tabIndex={0}
                    aria-label={`Avatar crop position: ${Math.round(draft.avatarPositionX)}% horizontal, ${Math.round(draft.avatarPositionY)}% vertical`}
                    aria-describedby="avatar-crop-help"
                    onPointerDown={startAvatarDrag}
                    onPointerMove={moveAvatar}
                    onPointerUp={finishAvatarDrag}
                    onPointerCancel={finishAvatarDrag}
                    onKeyDown={moveAvatarWithKeyboard}
                  ><img src={draft.image} alt="" style={{ objectPosition: `${draft.avatarPositionX}% ${draft.avatarPositionY}%` }}/><i aria-hidden="true"/></div>
                  <p id="avatar-crop-help">Drag the portrait inside the circle to choose the avatar position. Use arrow keys for precise adjustments.</p>
                </section>
              </div>
            )}
            <p className={styles.mediaNotice}><Icon name="info"/><span><b>Character creation rules:</b> All depicted characters must be adults aged 18 or older. Do not upload nudity, sexually explicit content, unedited low-quality images, or images you do not own or have permission to use. Violations may block or remove public display.</span></p>
          </section>

          <section className={styles.formSection}>
            <header className={styles.sectionTitle}><div><span>03</span><h2>Character details</h2></div><p>Introduce the character publicly, then define how they should behave in every conversation.</p></header>
            <Field label="Character Intro" required hint="Shown publicly on the character card. Give people a clear, compelling reason to meet this character." count={`${draft.intro.length}/500`}><textarea rows={5} maxLength={500} value={draft.intro} placeholder="Introduce the character's identity, personality, and story hook…" onChange={(event) => update({ intro: event.target.value })}/></Field>
            <Field label="Opening Scene" required hint="The first scene users will see. Establish the setting, action, and the character's opening line." count={`${draft.opening.length}/2000`}><textarea rows={8} maxLength={2000} value={draft.opening} placeholder="Set the scene and invite the user into the story…" onChange={(event) => update({ opening: event.target.value })}/></Field>
            <Field label="Character Settings" required hint="Private instructions that guide every reply. Define personality, history, goals, boundaries, and the relationship with the user." count={`${draft.characterSettings.length}/5000`}><textarea rows={11} maxLength={5000} value={draft.characterSettings} placeholder="Define the character's core identity, memories, motivations, boundaries, and relationship with the user…" onChange={(event) => update({ characterSettings: event.target.value })}/></Field>
          </section>

          <section className={styles.formSection}>
            <details className={styles.moreSettings} open>
              <summary><span><b>More Settings</b><small>Optional tools for a more consistent voice and behavior</small></span><i>⌄</i></summary>
              <div className={styles.settingsBody}>
                <Field label="Example Dialogues" hint="Show how the character speaks and reacts. Use {{user}} and {{char}} to identify each speaker." count={`${draft.examples.length}/4000`}><textarea rows={8} maxLength={4000} value={draft.examples} placeholder={'{{user}}: Do you know me?\n{{char}}: Longer than you realize.'} onChange={(event) => update({ examples: event.target.value })}/></Field>
                <Field label="Response rules" hint="Add specific behaviors the character should always follow—or avoid—in every reply."><textarea rows={6} value={draft.replyRules} placeholder="For example: Move the story through actions; never decide for the user; avoid repeating the previous reply…" onChange={(event) => update({ replyRules: event.target.value })}/></Field>
              </div>
            </details>
          </section>

          <section className={styles.formSection}>
            <header className={styles.sectionTitle}><div><span>04</span><h2>Publish settings</h2></div><p>Choose how people can discover, understand, and access your character.</p></header>
            <div className={styles.tagField}>
              <div className={styles.tagLabelRow}><b>Tags<i className={styles.requiredMark}>*</i></b><small>{tags.length}/5 selected</small></div>
              <p>Tags help people discover your character in search and recommendations. Choose the most relevant ones so the right audience can find you.</p>
              <div className={styles.tagSelector}>
                <div className={styles.selectedTags}>
                  {tags.map((tag) => <span key={tag}>{tag}<button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`}>×</button></span>)}
                  <button type="button" className={styles.tagSelectTrigger} onClick={() => setTagPickerOpen((open) => !open)} aria-expanded={tagPickerOpen}><b>＋</b>{tags.length ? "Add tags" : "Select tags"}<i>⌄</i></button>
                </div>
                {tagPickerOpen && <section className={styles.tagPicker} aria-label="Tag options">
                  <header><div><b>Select tags</b><small>Choose up to five</small></div><button type="button" onClick={() => setTagPickerOpen(false)} aria-label="Close tag options"><Icon name="close"/></button></header>
                  {TAG_OPTIONS.length > 0
                    ? <div>{TAG_OPTIONS.map((tag) => <button type="button" key={tag} className={tags.includes(tag) ? styles.selectedTagOption : ""} aria-pressed={tags.includes(tag)} onClick={() => toggleTag(tag)} disabled={!tags.includes(tag) && tags.length >= 5}>{tag}{tags.includes(tag) && <i>✓</i>}</button>)}</div>
                    : <p>The tag taxonomy is being prepared. Available options will appear here once confirmed.</p>}
                </section>}
              </div>
            </div>
            <div className={styles.optionGroups}>
              <fieldset><legend>Content rating<i className={styles.requiredMark}>*</i></legend><button className={draft.rating === "Limited" ? styles.selected : ""} onClick={() => update({ rating: "Limited" })}><b>Limited</b><small>Suitable for general audiences</small></button><button className={draft.rating === "Limitless" ? styles.selected : ""} onClick={() => update({ rating: "Limitless" })}><b>Limitless</b><small>Adult-oriented themes for users aged 18+</small></button></fieldset>
              <fieldset><legend>Visibility<i className={styles.requiredMark}>*</i></legend><button className={draft.visibility === "Public" ? styles.selected : ""} onClick={() => update({ visibility: "Public" })}><b>Public</b><small>Discoverable in search and recommendations</small></button><button className={draft.visibility === "Private" ? styles.selected : ""} onClick={() => update({ visibility: "Private" })}><b>Private</b><small>Visible only to you</small></button></fieldset>
            </div>
            <div className={styles.confirmations}>
              <label><input type="checkbox" checked={draft.adultConfirmed} onChange={(event) => update({ adultConfirmed: event.target.checked })}/><span><b>I confirm that this character is depicted as an adult aged 18 or older<i className={styles.requiredMark}>*</i></b><small>Required before publishing</small></span></label>
              <label><input type="checkbox" checked={draft.rightsConfirmed} onChange={(event) => update({ rightsConfirmed: event.target.checked })}/><span><b>I own or have permission to use the uploaded images and content<i className={styles.requiredMark}>*</i></b><small>Required before publishing · This content must not infringe third-party rights</small></span></label>
            </div>
          </section>
        </div>

        <footer className={styles.actionBar}>
          <button onClick={() => showToast("This browser currently has one auto-saved draft")}><Icon name="box"/><span>Draft Box</span></button>
          <button onClick={() => setDialog("reset")}><Icon name="reset"/><span>Reset</span></button>
          <button onClick={saveNow}><Icon name="save"/><span>Save</span></button>
          <button className={styles.createButton} disabled={!canCreate} onClick={() => setDialog("created")}>Create</button>
          <Link href="/create"><Icon name="book"/>Guide</Link>
        </footer>
      </div>

      <aside className={`${styles.previewColumn} ${mobilePreview ? styles.previewOpen : ""}`}>
        <button className={styles.previewClose} onClick={() => setMobilePreview(false)} aria-label="Close preview"><Icon name="close"/></button>
        <h2>Preview</h2>
        <div className={styles.consumerCardPreview}>
          <article className={`tipsy-card ${styles.staticConsumerCard}`} aria-label="Home character card preview">
            <div className="card-hit-area">
              <img className="tipsy-card-cover" src={previewCover} alt="Character cover preview"/>
              <span className="card-darken" />
              <span className="card-copy">
                <strong>{draft.name || "Character name"}</strong>
                {tags.length > 0 && <span className="card-meta-row">{tags.slice(0, 3).map((tag, tagIndex) => <span className={`character-tag${tagIndex === 2 ? " character-tag-tertiary" : ""}`} key={tag}>{tag}</span>)}</span>}
                <span className="card-tagline" tabIndex={0}>{draft.intro || "Your public Character Intro will appear here."}</span>
              </span>
            </div>
          </article>
        </div>
        <div className={styles.previewNote}><Icon name="eye"/><p><b>Static home card preview</b><span>Scroll inside Character Intro to review longer public text. Private character settings are not shown.</span></p></div>
      </aside>
    </section>

    <button className={styles.mobilePreviewButton} onClick={() => { setImportOpen(false); setMobilePreview(true); }}><Icon name="eye"/>Preview</button>
    {mobilePreview && <button className={styles.backdrop} aria-label="Close panel" onClick={() => setMobilePreview(false)}/>}

    {importResult && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={() => setImportResult(null)}>
      <section className={`${styles.dialog} ${styles.importDialog}`} role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className={styles.dialogClose} onClick={() => setImportResult(null)} aria-label="Close"><Icon name="close"/></button>
        <span className={styles.dialogKicker}>LOCAL IMPORT</span>
        <h2 id="import-title">{importResult.fileName}</h2>
        <p>{importResult.summary}</p>
        {importResult.kind === "json" && <div className={styles.mappingList}>{Object.entries(importResult.mapped ?? {}).filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value)).map(([key, value]) => <div key={key}><b>{key}</b><span>{String(value).slice(0, 140)}</span></div>)}</div>}
        {importResult.kind === "txt" && <>
          <label className={styles.importTarget}>Place text in<select value={textTarget} onChange={(event) => setTextTarget(event.target.value as TextTarget)}><option value="settings">Character Settings</option><option value="intro">Character Intro</option><option value="opening">Opening Scene</option><option value="examples">Example Dialogues</option></select></label>
          <pre>{importResult.raw.slice(0, 900)}</pre>
        </>}
        {importResult.kind === "novel" && <div className={styles.novelRoadmap}><Icon name="book"/><div><b>Novel parsing is on the roadmap</b><p>The goal is to extract candidate characters, relationships, world details, and interactive story beats for creator review—not to paste an entire novel into Character Settings.</p></div></div>}
        <footer><button onClick={() => setImportResult(null)}>Cancel</button>{importResult.kind !== "novel" && <button className={styles.primaryDialogButton} onClick={applyImport}>Apply to form</button>}</footer>
      </section>
    </div>}

    {dialog && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={() => setDialog(null)}><section className={styles.dialog} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className={styles.dialogClose} onClick={() => setDialog(null)} aria-label="Close"><Icon name="close"/></button>{dialog === "reset" && <><span className={styles.dialogKicker}>RESET DRAFT</span><h2>Clear this draft?</h2><p>Every field and the locally auto-saved draft will be cleared. This action cannot be undone.</p><footer><button onClick={() => setDialog(null)}>Cancel</button><button className={styles.dangerButton} onClick={resetDraft}>Reset draft</button></footer></>}{dialog === "created" && <><span className={styles.dialogKicker}>PROTOTYPE COMPLETE</span><h2>The character passed the local completeness check</h2><p>No production backend is connected, so nothing will be published. This result is only for reviewing the creation flow and fields.</p><footer><button className={styles.primaryDialogButton} onClick={() => setDialog(null)}>Continue editing</button></footer></>}</section></div>}

    {toast && <div className={styles.toast}><Icon name="check"/>{toast}</div>}
  </main>;
}
