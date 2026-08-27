"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { CommunityLink } from "@/components/community-link";
import { ApiError, createCreationDraft, getCreationDraft, getCreatorTags, publishCreationDraft, updateCreationDraft, uploadCreatorPortrait } from "@/lib/api";
import type { CreationDraftContent, CreationWork, CreatorTag } from "@/lib/api";
import { normalizeCreatorTagIds } from "@/lib/creator-tags";
import type { AuthUser } from "@/lib/types";
import styles from "./character-create-v1.module.css";
import { CreateIcon, SearchIcon, TranslationIcon } from "@/components/icons";

type Rating = "Limited" | "Limitless";
type Visibility = "Public" | "Private";
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
  portraitPositionX: number;
  portraitPositionY: number;
  portraitZoom: number;
  avatarPositionX: number;
  avatarPositionY: number;
  avatarZoom: number;
  rating: Rating;
  visibility: Visibility;
  tags: string[];
  adultConfirmed: boolean;
  rightsConfirmed: boolean;
};

type ImportResult = {
  fileName: string;
  mapped: Partial<CharacterDraft>;
  summary: string;
};

const STORAGE_KEY = "plum.create.v1.single-character";
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
  portraitPositionX: 50,
  portraitPositionY: 50,
  portraitZoom: 100,
  avatarPositionX: 50,
  avatarPositionY: 50,
  avatarZoom: 100,
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

function normalizeZoom(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(200, Math.max(100, value)) : 100;
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

function characterCreationError(error: unknown) {
  if (!(error instanceof ApiError)) return "The publish request could not be completed. Your saved draft is unchanged.";
  if (error.status === 401) return "Sign in before publishing this character. Your browser draft is still saved.";
  if (error.message === "character_moderation_not_configured") return "Character review is not available yet. Nothing was published, and your server draft remains saved.";
  if (error.message === "character_moderation_rejected") return "The character was not approved. Nothing was created; review the content before trying again.";
  if (error.message === "character_moderation_review_required") return "Automatic review could not make a final decision. Nothing was created in this version.";
  if (error.message === "character_confirmation_required") return "Both creator confirmations are required before creation.";
  if (error.message === "character_tag_invalid") return "One or more selected Tags are no longer available. Refresh the Tag list and try again.";
  if (error.message === "creator_media_not_claimable") return "This portrait can no longer be used. Upload it again before creating the character.";
  if (error.status === 409) return "This creation request conflicts with an earlier attempt. Edit the draft or try again.";
  if (error.status === 422) return "Some character fields are invalid or too long. Review the form and try again.";
  return "The creation service is temporarily unavailable. Nothing was created, and your browser draft is still saved.";
}

function mapCharacterCardJson(raw: unknown): Partial<CharacterDraft> {
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

export function CharacterCreateV1({ user, balance, onSignOut }: { user: AuthUser; balance: number; onSignOut: () => Promise<void> }) {
  const router = useRouter();
  const [draft, setDraft] = useState<CharacterDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState(true);
  const [toast, setToast] = useState("");
  const [dialog, setDialog] = useState<"reset" | "publishResult" | "creationError" | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [reservedImport, setReservedImport] = useState<"text" | "novel" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagOptions, setTagOptions] = useState<CreatorTag[]>([]);
  const [tagLoading, setTagLoading] = useState(true);
  const [tagError, setTagError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [creatingCharacter, setCreatingCharacter] = useState(false);
  const [creationError, setCreationError] = useState("");
  const [createdCharacterId, setCreatedCharacterId] = useState("");
  const [workId, setWorkId] = useState("");
  const [workRevision, setWorkRevision] = useState(0);
  const [moderationStatus, setModerationStatus] = useState<CreationWork["moderation_status"]>("not_submitted");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cropDrag = useRef<{ target: "portrait" | "avatar"; pointerId: number; startX: number; startY: number; positionX: number; positionY: number; width: number; height: number } | null>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const creationAttempt = useRef<{ signature: string; idempotencyKey: string } | null>(null);

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
          portraitPositionX: normalizePosition(parsed.portraitPositionX),
          portraitPositionY: normalizePosition(parsed.portraitPositionY),
          portraitZoom: normalizeZoom(parsed.portraitZoom),
          avatarPositionX: normalizePosition(parsed.avatarPositionX),
          avatarPositionY: normalizePosition(parsed.avatarPositionY),
          avatarZoom: normalizeZoom(parsed.avatarZoom),
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

  async function loadTags() {
    setTagLoading(true);
    setTagError("");
    try {
      const result = await getCreatorTags();
      if (!result.items.length) throw new Error("empty_tag_vocabulary");
      setTagOptions(result.items);
    } catch {
      setTagOptions([]);
      setTagError("Could not load the Tag vocabulary. Try again.");
    } finally {
      setTagLoading(false);
    }
  }

  useEffect(() => { void loadTags(); }, []);

  useEffect(() => {
    if (!user) return;
    const requestedWorkId = new URLSearchParams(window.location.search).get("work_id")?.trim();
    if (!requestedWorkId || requestedWorkId === workId) return;
    void getCreationDraft(requestedWorkId)
      .then(({ work }) => {
        const content = work.content;
        setWorkId(work.work_id);
        setWorkRevision(work.revision);
        setModerationStatus(work.moderation_status);
        setCreatedCharacterId(work.published_character_id ?? "");
        setDraft({
          ...EMPTY_DRAFT,
          name: content.display_name,
          gender: content.gender,
          intro: content.intro,
          opening: content.opening_scene,
          characterSettings: content.character_settings,
          examples: content.example_dialogues,
          replyRules: content.response_rules,
          image: work.portrait_preview_url ?? "",
          portraitMediaId: content.portrait_media_id,
          portraitPositionX: normalizePosition(content.portrait_position_x),
          portraitPositionY: normalizePosition(content.portrait_position_y),
          portraitZoom: normalizeZoom(content.portrait_zoom),
          avatarPositionX: normalizePosition(content.avatar_position_x),
          avatarPositionY: normalizePosition(content.avatar_position_y),
          avatarZoom: normalizeZoom(content.avatar_zoom),
          rating: content.creator_declared_rating === "mature" ? "Limitless" : "Limited",
          visibility: content.visibility === "public" ? "Public" : "Private",
          tags: content.tag_ids,
          adultConfirmed: content.adult_confirmed,
          rightsConfirmed: content.rights_confirmed,
        });
        setSaved(true);
      })
      .catch(() => showToast("Could not restore this server draft"));
  }, [user, workId]);

  useEffect(() => {
    if (!hydrated || !tagOptions.length) return;
    setDraft((current) => {
      const normalized = normalizeCreatorTagIds(current.tags, tagOptions);
      return normalized.join("\0") === current.tags.join("\0")
        ? current
        : { ...current, tags: normalized };
    });
  }, [hydrated, tagOptions]);

  const selectedTags = draft.tags
    .map((id) => tagOptions.find((option) => option.id === id))
    .filter((option): option is CreatorTag => Boolean(option))
    .slice(0, 5);
  const previewCover = draft.image || "/characters/luna.svg";
  const canCreate = Boolean(
    draft.name.trim()
    && draft.gender
    && draft.image
    && draft.portraitMediaId
    && draft.intro.trim()
    && draft.opening.trim()
    && draft.characterSettings.trim()
    && selectedTags.length > 0
    && draft.rating
    && draft.visibility
    && draft.adultConfirmed
    && draft.rightsConfirmed
  );

  function update(patch: Partial<CharacterDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function toggleTag(tagId: string) {
    setDraft((current) => current.tags.includes(tagId)
      ? { ...current, tags: current.tags.filter((item) => item !== tagId) }
      : current.tags.length < 5 ? { ...current, tags: [...current.tags, tagId] } : current);
  }

  function removeTag(tagId: string) {
    update({ tags: draft.tags.filter((item) => item !== tagId) });
  }

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }

  function currentDraftContent(): CreationDraftContent {
    return {
      display_name: draft.name.trim(),
      gender: draft.gender,
      portrait_media_id: draft.portraitMediaId,
      portrait_position_x: Math.round(normalizePosition(draft.portraitPositionX)),
      portrait_position_y: Math.round(normalizePosition(draft.portraitPositionY)),
      portrait_zoom: Math.round(normalizeZoom(draft.portraitZoom)),
      avatar_position_x: Math.round(normalizePosition(draft.avatarPositionX)),
      avatar_position_y: Math.round(normalizePosition(draft.avatarPositionY)),
      avatar_zoom: Math.round(normalizeZoom(draft.avatarZoom)),
      intro: draft.intro.trim(),
      opening_scene: draft.opening.trim(),
      character_settings: draft.characterSettings.trim(),
      example_dialogues: draft.examples.trim(),
      response_rules: draft.replyRules.trim(),
      tag_ids: draft.tags,
      creator_declared_rating: draft.rating === "Limited" ? "general" : "mature",
      visibility: draft.visibility === "Public" ? "public" : "private",
      adult_confirmed: draft.adultConfirmed,
      rights_confirmed: draft.rightsConfirmed,
    };
  }

  async function saveDraftToServer(): Promise<CreationWork> {
    const content = currentDraftContent();
    setSavingDraft(true);
    try {
      const result = workId
        ? await updateCreationDraft(workId, workRevision, content)
        : await createCreationDraft(content);
      setWorkId(result.work.work_id);
      setWorkRevision(result.work.revision);
      setModerationStatus(result.work.moderation_status);
      const url = new URL(window.location.href);
      url.searchParams.set("work_id", result.work.work_id);
      window.history.replaceState(null, "", url);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      setSaved(true);
      return result.work;
    } finally {
      setSavingDraft(false);
    }
  }

  async function saveServerDraft() {
    if (savingDraft || creatingCharacter) return;
    try {
      await saveDraftToServer();
      showToast("Draft saved to My Studio");
    } catch (error) {
      showToast(error instanceof ApiError && error.status === 409
        ? "This draft changed elsewhere. Refresh before saving again."
        : "Could not save the server draft. The browser copy is still safe.");
    }
  }

  function resetDraft() {
    setDraft(EMPTY_DRAFT);
    setImportResult(null);
    setCreationError("");
    setCreatedCharacterId("");
    setWorkId("");
    setWorkRevision(0);
    setModerationStatus("not_submitted");
    creationAttempt.current = null;
    window.localStorage.removeItem(STORAGE_KEY);
    const url = new URL(window.location.href);
    url.searchParams.delete("work_id");
    window.history.replaceState(null, "", url);
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
        portraitPositionX: 50,
        portraitPositionY: 50,
        portraitZoom: 100,
        avatarPositionX: 50,
        avatarPositionY: 50,
        avatarZoom: 100,
      });
      showToast("Character portrait uploaded");
    } catch (error) {
      showToast(portraitUploadError(error));
    } finally {
      setUploadingImage(false);
    }
  }

  async function publishCharacter() {
    if (!canCreate || creatingCharacter) return;
    const input = currentDraftContent();
    const signature = JSON.stringify(input);
    if (creationAttempt.current?.signature !== signature) {
      creationAttempt.current = {
        signature,
        idempotencyKey: `character-create-${crypto.randomUUID()}`,
      };
    }
    setCreatingCharacter(true);
    setCreationError("");
    try {
      const savedWork = await saveDraftToServer();
      const result = await publishCreationDraft(
        savedWork.work_id,
        savedWork.revision,
        creationAttempt.current.idempotencyKey,
      );
      setModerationStatus(result.moderation_status);
      setCreatedCharacterId(result.character?.character_id ?? savedWork.published_character_id ?? "");
      setDialog("publishResult");
    } catch (error) {
      setCreationError(characterCreationError(error));
      setDialog("creationError");
    } finally {
      setCreatingCharacter(false);
    }
  }

  function startCropDrag(target: "portrait" | "avatar", event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    cropDrag.current = {
      target,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      positionX: target === "portrait" ? draft.portraitPositionX : draft.avatarPositionX,
      positionY: target === "portrait" ? draft.portraitPositionY : draft.avatarPositionY,
      width: bounds.width,
      height: bounds.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveCrop(event: React.PointerEvent<HTMLDivElement>) {
    const drag = cropDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const positionX = Math.min(100, Math.max(0, drag.positionX - ((event.clientX - drag.startX) / drag.width) * 100));
    const positionY = Math.min(100, Math.max(0, drag.positionY - ((event.clientY - drag.startY) / drag.height) * 100));
    update(drag.target === "portrait"
      ? { portraitPositionX: positionX, portraitPositionY: positionY }
      : { avatarPositionX: positionX, avatarPositionY: positionY });
  }

  function finishCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (cropDrag.current?.pointerId !== event.pointerId) return;
    cropDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function moveCropWithKeyboard(target: "portrait" | "avatar", event: React.KeyboardEvent<HTMLDivElement>) {
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    update(target === "portrait"
      ? {
          portraitPositionX: Math.min(100, Math.max(0, draft.portraitPositionX + offset[0])),
          portraitPositionY: Math.min(100, Math.max(0, draft.portraitPositionY + offset[1])),
        }
      : {
          avatarPositionX: Math.min(100, Math.max(0, draft.avatarPositionX + offset[0])),
          avatarPositionY: Math.min(100, Math.max(0, draft.avatarPositionY + offset[1])),
        });
  }

  function adjustCropZoom(target: "portrait" | "avatar", amount: number) {
    update(target === "portrait"
      ? { portraitZoom: normalizeZoom(draft.portraitZoom + amount) }
      : { avatarZoom: normalizeZoom(draft.avatarZoom + amount) });
  }

  async function handleJsonImport(event: ChangeEvent<HTMLInputElement>) {
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
      const mapped = mapCharacterCardJson(JSON.parse(raw) as unknown);
      const mappedCount = Object.values(mapped).filter(Boolean).length;
      setImportResult({ fileName: file.name, mapped, summary: `${mappedCount} fields can be mapped. Review them before applying.` });
    } catch (error) {
      showToast(error instanceof Error ? `Import failed: ${error.message}` : "Could not read the file");
    }
  }

  function applyImport() {
    if (!importResult) return;
    const clean = Object.fromEntries(Object.entries(importResult.mapped).filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value))) as Partial<CharacterDraft>;
    if (clean.tags) clean.tags = normalizeCreatorTagIds(clean.tags, tagOptions);
    update(clean);
    showToast("Character card fields added to the form");
    setImportResult(null);
  }

  return <main className={styles.shell}>
    <header className="site-header">
      <div className="header-brand-group"><Brand ariaLabel="Back to Plum home"/><CommunityLink /></div>
      <div className="site-header-actions">
        <button className="header-circle" aria-label="Search" onClick={() => router.push("/?search=1")}><SearchIcon/></button>
        <button className="header-circle" aria-label="Create" title="Create" aria-current="page"><CreateIcon/></button>
        <div className="header-menu-wrap">
          <button className="header-circle language-symbol" aria-label="Change language" aria-expanded={languageOpen} onClick={() => setLanguageOpen((open) => !open)}><TranslationIcon/></button>
          {languageOpen && <div className="header-dropdown language-menu"><button>简体中文</button><button className="selected">English <span>✓</span></button><small>More languages are coming.</small></div>}
        </div>
        <div className="header-menu-wrap">
          <button className="coin-button" onClick={() => setWalletOpen((open) => !open)} aria-label={`Coin balance ${balance}`}><span>✦</span><strong>{balance.toLocaleString("en-US")}</strong></button>
          {walletOpen && <div className="header-dropdown wallet-panel"><small>Coin balance</small><strong>{balance.toLocaleString("en-US")}</strong><h3>Recent activity</h3><p>No activity yet.</p><button disabled>Top up · Coming later</button></div>}
        </div>
        <div className="header-menu-wrap">
          <button className="account-button" onClick={() => setAccountOpen((open) => !open)} aria-label="Account settings"><i>{user.display_name.slice(0, 1).toUpperCase()}</i><span>{user.display_name}</span><b>⌄</b></button>
          {accountOpen && <div className="header-dropdown account-menu"><button onClick={() => router.push("/studio")}>My Studio</button><button disabled>Account settings · Coming later</button><button onClick={() => { setAccountOpen(false); void onSignOut(); }}>Sign out</button></div>}
        </div>
      </div>
    </header>

    <section className={styles.pageIntro}>
      <div><span>CREATE CHARACTER</span><h1>Create a character worth meeting</h1><p>Start with a name, then shape the look and story—or import something you already have.</p></div>
      <div className={styles.pageIntroActions}>
        {workId && <span className={styles.reviewStatus}>{moderationStatus === "approved" ? "Published" : moderationStatus === "pending_review" ? createdCharacterId ? "Changes under review" : "Under review" : moderationStatus === "rejected" ? "Changes rejected" : createdCharacterId ? "Unpublished changes" : "Draft"}</span>}
        <span className={styles.saveStatus}><i className={saved ? styles.saved : ""}/>{savingDraft ? "Saving draft…" : workId ? "Saved to Studio" : saved ? "Saved locally" : "Saving locally…"}</span>
        <div className={styles.importMenuWrap}>
          <button className={styles.importEntryButton} onClick={() => setImportOpen((open) => !open)} aria-expanded={importOpen} aria-label="Import existing content"><Icon name="upload"/>Import existing content</button>
          {importOpen && <section className={styles.importPopover} aria-label="Import existing content">
            <header><div><small>IMPORT</small><h2>Start from existing content</h2></div><button onClick={() => setImportOpen(false)} aria-label="Close import menu"><Icon name="close"/></button></header>
            <p>Start from a character card, text file, or novel.</p>
            <div className={styles.importPopoverActions}>
              <button onClick={() => jsonInput.current?.click()}><Icon name="file"/><span><b>Character card JSON</b><small>Map character fields automatically</small></span><Icon name="arrow"/></button>
              <button onClick={() => { setImportOpen(false); setReservedImport("text"); }}><Icon name="upload"/><span><b>TXT file</b><small>Backend parsing interface reserved</small></span><Icon name="arrow"/></button>
              <button className={styles.novelImport} onClick={() => { setImportOpen(false); setReservedImport("novel"); }}><Icon name="book"/><span><b>A novel <i>ROADMAP</i></b><small>Backend parsing planned</small></span><Icon name="arrow"/></button>
            </div>
            <div className={styles.importPrivacy}><Icon name="info"/><span>Only character card JSON is read locally. Text parsing is not active yet.</span></div>
            <input ref={jsonInput} className={styles.hiddenInput} type="file" accept=".json,application/json" onChange={handleJsonImport}/>
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
                  <div
                    className={styles.portraitCrop}
                    role="group"
                    tabIndex={0}
                    aria-label={`Portrait crop position: ${Math.round(draft.portraitPositionX)}% horizontal, ${Math.round(draft.portraitPositionY)}% vertical, ${Math.round(draft.portraitZoom)}% zoom`}
                    aria-describedby="portrait-crop-help"
                    onPointerDown={(event) => startCropDrag("portrait", event)}
                    onPointerMove={moveCrop}
                    onPointerUp={finishCropDrag}
                    onPointerCancel={finishCropDrag}
                    onKeyDown={(event) => moveCropWithKeyboard("portrait", event)}
                  ><img src={draft.image} alt="Uploaded character portrait" style={{ objectPosition: `${draft.portraitPositionX}% ${draft.portraitPositionY}%`, transform: `scale(${draft.portraitZoom / 100})`, transformOrigin: `${draft.portraitPositionX}% ${draft.portraitPositionY}%` }}/><span className={styles.dragHint} aria-hidden="true">Drag to reposition</span></div>
                  <fieldset className={styles.cropControls}>
                    <legend>Zoom</legend>
                    <button type="button" aria-label="Zoom portrait out" onClick={() => adjustCropZoom("portrait", -10)}>−</button>
                    <input aria-label="Portrait zoom" type="range" min="100" max="200" step="1" value={draft.portraitZoom} onChange={(event) => update({ portraitZoom: Number(event.target.value) })}/>
                    <button type="button" aria-label="Zoom portrait in" onClick={() => adjustCropZoom("portrait", 10)}>＋</button>
                    <output>{Math.round(draft.portraitZoom)}%</output>
                  </fieldset>
                  <p id="portrait-crop-help">Drag inside the frame to reposition. Zooming in expands the available drag range.</p>
                  <label aria-busy={uploadingImage}><Icon name="upload"/>{uploadingImage ? "Uploading…" : "Replace portrait"}<input type="file" accept={PORTRAIT_ACCEPT} disabled={uploadingImage} onChange={handleImage}/></label>
                </section>
                <section className={styles.avatarPreview}>
                  <header><b>Character avatar</b><small>Shown beside the character in profile and chat surfaces</small></header>
                  <div
                    className={styles.avatarCrop}
                    role="group"
                    tabIndex={0}
                    aria-label={`Avatar crop position: ${Math.round(draft.avatarPositionX)}% horizontal, ${Math.round(draft.avatarPositionY)}% vertical, ${Math.round(draft.avatarZoom)}% zoom`}
                    aria-describedby="avatar-crop-help"
                    onPointerDown={(event) => startCropDrag("avatar", event)}
                    onPointerMove={moveCrop}
                    onPointerUp={finishCropDrag}
                    onPointerCancel={finishCropDrag}
                    onKeyDown={(event) => moveCropWithKeyboard("avatar", event)}
                  ><img src={draft.image} alt="" style={{ objectPosition: `${draft.avatarPositionX}% ${draft.avatarPositionY}%`, transform: `scale(${draft.avatarZoom / 100})`, transformOrigin: `${draft.avatarPositionX}% ${draft.avatarPositionY}%` }}/><span className={styles.dragHint} aria-hidden="true">Drag to reposition</span></div>
                  <fieldset className={styles.cropControls}>
                    <legend>Zoom</legend>
                    <button type="button" aria-label="Zoom avatar out" onClick={() => adjustCropZoom("avatar", -10)}>−</button>
                    <input aria-label="Avatar zoom" type="range" min="100" max="200" step="1" value={draft.avatarZoom} onChange={(event) => update({ avatarZoom: Number(event.target.value) })}/>
                    <button type="button" aria-label="Zoom avatar in" onClick={() => adjustCropZoom("avatar", 10)}>＋</button>
                    <output>{Math.round(draft.avatarZoom)}%</output>
                  </fieldset>
                  <p id="avatar-crop-help">Drag inside the circle to reposition. Zooming in expands the available drag range; use arrow keys for precise movement.</p>
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
                <Field label="Response rules" hint="Add specific behaviors the character should always follow—or avoid—in every reply." count={`${draft.replyRules.length}/3000`}><textarea rows={6} maxLength={3000} value={draft.replyRules} placeholder="For example: Move the story through actions; never decide for the user; avoid repeating the previous reply…" onChange={(event) => update({ replyRules: event.target.value })}/></Field>
              </div>
            </details>
          </section>

          <section className={styles.formSection}>
            <header className={styles.sectionTitle}><div><span>04</span><h2>Publish settings</h2></div><p>Choose how people can discover, understand, and access your character.</p></header>
            <div className={styles.tagField}>
              <div className={styles.tagLabelRow}><b>Tags<i className={styles.requiredMark}>*</i></b><small>{selectedTags.length}/5 selected</small></div>
              <p>Tags help people discover your character in search and recommendations. Choose the most relevant ones so the right audience can find you.</p>
              <div className={styles.tagSelector}>
                <div className={styles.selectedTags}>
                  {selectedTags.map((tag) => <span key={tag.id}>{tag.display_name}<button type="button" onClick={() => removeTag(tag.id)} aria-label={`Remove ${tag.display_name}`}>×</button></span>)}
                  <button type="button" className={styles.tagSelectTrigger} onClick={() => setTagPickerOpen((open) => !open)} aria-expanded={tagPickerOpen}><b>＋</b>{selectedTags.length ? "Add tags" : "Select tags"}<i>⌄</i></button>
                </div>
                {tagPickerOpen && <section className={styles.tagPicker} aria-label="Tag options">
                  <header><div><b>Select tags</b><small>Choose up to five</small></div><button type="button" onClick={() => setTagPickerOpen(false)} aria-label="Close tag options"><Icon name="close"/></button></header>
                  {tagLoading
                    ? <p>Loading Tag options…</p>
                    : tagError
                      ? <p>{tagError} <button type="button" onClick={() => void loadTags()}>Retry</button></p>
                      : <div>{tagOptions.map((tag) => <button type="button" key={tag.id} className={draft.tags.includes(tag.id) ? styles.selectedTagOption : ""} aria-pressed={draft.tags.includes(tag.id)} onClick={() => toggleTag(tag.id)} disabled={!draft.tags.includes(tag.id) && selectedTags.length >= 5}>{tag.display_name}{draft.tags.includes(tag.id) && <i>✓</i>}</button>)}</div>}
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
          <button onClick={() => router.push("/studio?view=drafts")}><Icon name="box"/><span>Draft Box</span></button>
          <button onClick={() => setDialog("reset")}><Icon name="reset"/><span>Reset</span></button>
          <button disabled={savingDraft || creatingCharacter} onClick={() => void saveServerDraft()}><Icon name="save"/><span>{savingDraft ? "Saving…" : "Save draft"}</span></button>
          <button className={styles.createButton} disabled={!canCreate || creatingCharacter || savingDraft} onClick={() => void publishCharacter()}>{creatingCharacter ? "Submitting…" : "Publish"}</button>
        </footer>
      </div>

      <aside className={`${styles.previewColumn} ${mobilePreview ? styles.previewOpen : ""}`}>
        <button className={styles.previewClose} onClick={() => setMobilePreview(false)} aria-label="Close preview"><Icon name="close"/></button>
        <h2>Preview</h2>
        <div className={styles.consumerCardPreview}>
          <article className={`character-card ${styles.staticConsumerCard}`} aria-label="Home character card preview">
            <div className="card-hit-area">
              <img className="character-card-cover" src={previewCover} alt="Character cover preview"/>
              <span className="card-darken" />
              <span className="card-copy">
                <strong>{draft.name || "Character name"}</strong>
                {selectedTags.length > 0 && <span className="card-meta-row">{selectedTags.slice(0, 3).map((tag, tagIndex) => <span className={`character-tag${tagIndex === 2 ? " character-tag-tertiary" : ""}`} key={tag.id}>{tag.display_name}</span>)}</span>}
                <span className="card-tagline" tabIndex={0}>{draft.intro || "Your public Character Intro will appear here."}</span>
              </span>
            </div>
          </article>
        </div>
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
        <div className={styles.mappingList}>{Object.entries(importResult.mapped).filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value)).map(([key, value]) => <div key={key}><b>{key}</b><span>{String(value).slice(0, 140)}</span></div>)}</div>
        <footer><button onClick={() => setImportResult(null)}>Cancel</button><button className={styles.primaryDialogButton} onClick={applyImport}>Apply to form</button></footer>
      </section>
    </div>}

    {reservedImport && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={() => setReservedImport(null)}>
      <section className={`${styles.dialog} ${styles.importDialog}`} role="dialog" aria-modal="true" aria-labelledby="reserved-import-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className={styles.dialogClose} onClick={() => setReservedImport(null)} aria-label="Close"><Icon name="close"/></button>
        <span className={styles.dialogKicker}>RESERVED INTERFACE</span>
        <h2 id="reserved-import-title">{reservedImport === "text" ? "TXT character parsing" : "Novel character parsing"}</h2>
        <p>Parsing is not active in this version. No file was selected, read, or uploaded.</p>
        <div className={styles.reservedImportNotice}><Icon name={reservedImport === "text" ? "upload" : "book"}/><div><b>Backend workflow planned</b><p>The backend interface is reserved for a future asynchronous pipeline. Provider fields, parsing rules, review steps, and result mapping will be designed before this entry is enabled.</p></div></div>
        <footer><button className={styles.primaryDialogButton} onClick={() => setReservedImport(null)}>Got it</button></footer>
      </section>
    </div>}

    {dialog && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={() => setDialog(null)}><section className={styles.dialog} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className={styles.dialogClose} onClick={() => setDialog(null)} aria-label="Close"><Icon name="close"/></button>{dialog === "reset" && <><span className={styles.dialogKicker}>RESET DRAFT</span><h2>Clear this browser draft?</h2><p>The local fields will be cleared. A server draft already saved in My Studio is not deleted by this action.</p><footer><button onClick={() => setDialog(null)}>Cancel</button><button className={styles.dangerButton} onClick={resetDraft}>Reset browser draft</button></footer></>}{dialog === "publishResult" && <><span className={styles.dialogKicker}>REVIEW STATUS</span><h2>{moderationStatus === "approved" ? "Published" : moderationStatus === "rejected" ? "Not approved" : "Submitted for review"}</h2><p>{moderationStatus === "approved" ? `The reviewed version is live. Character ID: ${createdCharacterId}` : moderationStatus === "rejected" ? createdCharacterId ? "The changes were not published. The previous approved version remains live." : "Nothing was published. Your saved draft is available for editing." : createdCharacterId ? "The changes are under review. The previous approved version remains live and available for chat." : "This version is under review and is not public or available for chat yet."}</p><footer><button onClick={() => setDialog(null)}>Continue editing</button><button className={styles.primaryDialogButton} onClick={() => router.push("/studio")}>Go to My Studio</button></footer></>}{dialog === "creationError" && <><span className={styles.dialogKicker}>PUBLISH NOT COMPLETED</span><h2>Nothing was published</h2><p>{creationError}</p><footer><button className={styles.primaryDialogButton} onClick={() => setDialog(null)}>Continue editing</button></footer></>}</section></div>}

    {toast && <div className={styles.toast}><Icon name="check"/>{toast}</div>}
  </main>;
}
