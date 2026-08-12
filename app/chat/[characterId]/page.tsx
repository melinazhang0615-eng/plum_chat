"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Brand } from "@/components/brand";
import { ApiError, cancelTurn, createConversation, getBootstrap, getConversation, getConversationHistory, logout, restartConversation, sendTurn, sendTurnStream, setCharacterFavorite, setCharacterLike, updateModel } from "@/lib/api";
import { formatCompactCount } from "@/lib/format";
import type { AuthUser, CharacterExperience, ChatMessage, Conversation, MessageStatus, ModelProfile } from "@/lib/types";
import { SignInCard, SignInReward, WelcomeModal } from "@/components/onboarding";
import { GUEST_LIMITS, SIGNIN_REWARD_COINS, bumpGuestQuota, canGuestContinue, clearPendingReward, getGuestProfile, getGuestQuota, getMockAuth, getUserName, hasPendingReward, markNudged, mockSignOut, wasNudged } from "@/lib/guest";

// Guest prototype: hidden instruction the Continue button sends; filtered from the visible transcript.
const CONTINUE_PROMPT = "*holds your gaze, saying nothing* Go on.";

function formatTime(value?: string) {
  if (!value) return "Just now";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "+08:00";
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "Just now" : date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.3 4.3" /></svg>;
}
function CreateIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>; }
function CommunityIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.3" /><path d="M3.5 19c.7-3.5 2.5-5.2 5.5-5.2s4.8 1.7 5.5 5.2M14.2 14.5c2.9-.7 5 .8 6.3 3.6" /></svg>; }
function TranslationIcon() { return <svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M550.761 343.763l1.717 3.313 122.97 281.118a26.353 26.353 0 0 1-46.772 24.064l-1.506-2.952-31.533-72.071H461.011l-31.503 72.071a26.353 26.353 0 0 1-49.423-18.01l1.114-3.102 123-281.118a26.383 26.383 0 0 1 46.562-3.313zm-22.407 79.601-44.273 101.165h88.516l-44.273-101.165z" /><path d="M521.306 120.471a377.826 377.826 0 0 1 370.146 302.2 26.353 26.353 0 1 1-51.621 10.481 325.12 325.12 0 0 0-623.195-48.489l-.903 2.56 58.307-19.426a26.353 26.353 0 0 1 32.106 13.583l1.204 3.072a26.353 26.353 0 0 1-13.552 32.106l-3.103 1.204-105.411 35.147a26.353 26.353 0 0 1-34.154-30.238 377.826 377.826 0 0 1 370.146-302.2zm334.878 423.393a26.353 26.353 0 0 1 35.298 29.847 377.826 377.826 0 0 1-740.352 0 26.353 26.353 0 0 1 51.652-10.481 325.12 325.12 0 0 0 620.213 56.23l2.891-7.469-42.134 16.203a26.353 26.353 0 0 1-32.678-12.107l-1.385-3.012a26.353 26.353 0 0 1 12.137-32.678l3.012-1.385 91.346-35.148z" /></svg>; }
const MODEL_LABELS: Record<string, string> = { fast: "Fast", balanced: "Balanced", immersive: "Immersive" };
const modelName = (m?: { profile: string; display_name: string } | null) => (m ? (MODEL_LABELS[m.profile] ?? m.display_name) : undefined);

function SendIcon() {
  return <svg viewBox="0 0 30 30" aria-hidden="true"><path d="M25.54 5.17 3.79 13.57c-1.23.47-1.2 1.16.06 1.53l5.26 1.56 2.14 6.36c.28.84 1.01 1.01 1.63.39l2.76-2.73 5.44 3.99c.71.52 1.44.25 1.63-.62l3.97-17.89c.19-.86-.32-1.3-1.14-.99Zm-3.31 4.05-9.28 8.27c-.17.15-.32.44-.34.66l-.41 3.85c-.05.44-.19.46-.33.04l-1.8-5.41c-.07-.22.03-.48.22-.59l11.77-7.06c.75-.45.83-.34.17.24Z" /></svg>;
}
function StopIcon() {
  return <svg viewBox="0 0 30 30" aria-hidden="true"><rect x="10" y="10" width="10" height="10" rx="1.5" /></svg>;
}
function MoreIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 10.83a.83.83 0 1 0 0-1.66.83.83 0 0 0 0 1.66ZM10 5a.83.83 0 1 0 0-1.67A.83.83 0 0 0 10 5Zm0 11.67A.83.83 0 1 0 10 15a.83.83 0 0 0 0 1.67Z" /></svg>;
}
function LevelIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 8 4v7c0 4.2-3.1 7.2-8 9-4.9-1.8-8-4.8-8-9V6l8-4Z" /><path d="m8 11 2.5 2.5L16.5 8M7 6.5l5-2.2 5 2.2" /></svg>;
}
function BookIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.2c3.4-.7 6.2 0 8.5 2.1v12c-2.3-2.1-5.1-2.8-8.5-2.1v-12Zm17 0c-3.4-.7-6.2 0-8.5 2.1v12c2.3-2.1 5.1-2.8 8.5-2.1v-12Z" /></svg>;
}
function MutedAutoIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3l4 3V7l-4 3H4ZM15 9.5l5 5m0-5-5 5M3 3l18 18" /></svg>;
}
function ThumbIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 21H4.8A1.8 1.8 0 0 1 3 19.2v-7.4A1.8 1.8 0 0 1 4.8 10h2.7v11Zm0-10.7 3.6-6.1c.55-.94 1.77-1.28 2.74-.77.8.43 1.23 1.35 1.04 2.24L14 9.5h4.9a2.1 2.1 0 0 1 2.02 2.68l-2.06 7.15A2.3 2.3 0 0 1 16.65 21H7.5V10.3Z" /></svg>;
}
function HeartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" /></svg>;
}
function ModelIcon() {
  return <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M.88 7.83a1.65 1.65 0 0 1 0-1.65l2.35-4.07a1.65 1.65 0 0 1 1.43-.82h4.69c.59 0 1.13.31 1.43.82l2.34 4.07a1.65 1.65 0 0 1 0 1.65l-2.35 4.06a1.65 1.65 0 0 1-1.42.82H4.66c-.59 0-1.14-.31-1.43-.82L.88 7.83Z" /><path d="M4 6h5.52a.2.2 0 0 0 .14-.34L8 4m2 4H4.48a.2.2 0 0 0-.14.34L6 10" /></svg>;
}
function NoteIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.25 7.08h6.41M6.25 11.2h5.03M15.4 6.36V4.33c0-1.01-.82-1.83-1.83-1.83H5.33c-1.01 0-1.83.82-1.83 1.83V14.4c0 1.02.82 1.84 1.83 1.84h4.12" /><path d="m15.84 9.22.84-.22c.29.17.39.54.22.83l-3.52 6.11-.72.5-.42-.24.02-.65 3.58-6.33Z" /></svg>;
}
function RoleIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="6.3" r="3" /><path d="M4.2 17c.45-3.56 2.4-5.34 5.8-5.34s5.35 1.78 5.8 5.34" /></svg>;
}
function SceneImageIcon() {
  return <svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 7.25h-3A3.25 3.25 0 0 0 8.75 10.5V18A3.25 3.25 0 0 0 12 21.25h6A3.25 3.25 0 0 0 21.25 18v-3.68" /><circle cx="12.5" cy="12.5" r="1.7" /><path d="m9 17.1 2.5-2.3 2.45 2.05 1.45-1.25 5.55 3.25M20 7.2l.78 1.8 1.8.78-1.8.78-.78 1.8-.78-1.8-1.8-.78 1.8-.78L20 7.2Z" /></svg>;
}
function SceneVideoIcon() {
  return <svg viewBox="0 0 30 30" aria-hidden="true"><rect x="7.8" y="7.8" width="14.4" height="14.4" rx="4" /><path d="m13.3 12.5 5 2.9-5 2.9v-5.8ZM21.2 6.7l.58 1.35 1.35.58-1.35.58-.58 1.35-.58-1.35-1.35-.58 1.35-.58.58-1.35Z" /></svg>;
}
function GalleryIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.2 4.8h8.2a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2H5.2a2 2 0 0 1-2-2V6.8a2 2 0 0 1 2-2Z" /><path d="M6.4 4.7V3.8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8.3M4 14l3.2-3.1 2.4 2 1.6-1.4 3.6 3.1" /><circle cx="11.8" cy="8.2" r="1.2" /></svg>;
}
function InspirationIcon() {
  return <svg viewBox="0 0 26 26" aria-hidden="true"><path d="M9.4 18.4h7.2M10.5 21.2h5M13 3.4a7 7 0 0 0-4.2 12.6c.85.65 1.3 1.31 1.42 2h5.56c.12-.69.57-1.35 1.42-2A7 7 0 0 0 13 3.4Z" /><path d="M13 0v2M3.9 4.1l1.45 1.45M0 13h2M22.1 4.1l-1.45 1.45M26 13h-2" /></svg>;
}
function CommentIcon() {
  return <svg className="comment-ico" viewBox="0 0 16 16" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M8 1.7c3.5 0 6.3 2.3 6.3 5.2 0 2.88-2.8 5.2-6.3 5.2-.62 0-1.22-.07-1.78-.2l-3.02 1.5c-.28.14-.6-.12-.52-.42l.63-2.3C2.06 9.86 1.7 8.64 1.7 6.9 1.7 4 4.5 1.7 8 1.7ZM5.4 6a.95.95 0 1 0 0 1.9.95.95 0 0 0 0-1.9Zm2.6 0a.95.95 0 1 0 0 1.9.95.95 0 0 0 0-1.9Zm2.6 0a.95.95 0 1 0 0 1.9.95.95 0 0 0 0-1.9Z" /></svg>;
}
function ScrollLatestIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M22.4 21.6H9.6M16 9.6v9.1m0 0 4-4.2m-4 4.2-4-4.2" /></svg>;
}
function BackIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>;
}
function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}
function RestartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 9A8 8 0 1 1 5 15.5M4.8 9V4.5M4.8 9h4.5" /></svg>;
}
function ShareIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.2" /><circle cx="6" cy="12" r="2.2" /><circle cx="18" cy="19" r="2.2" /><path d="m8 11 8-5M8 13l8 5" /></svg>;
}
function CollapseProfileIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>;
}
function CollectionsIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5.5h10.5A2.5 2.5 0 0 1 20 8v10.5H9.5A2.5 2.5 0 0 1 7 16V5.5Z" /><path d="M7 8H5.5A2.5 2.5 0 0 0 3 10.5V19a2 2 0 0 0 2 2h10.5a2.5 2.5 0 0 0 2.5-2.5" /><path className="collection-spark" d="m13.2 7.1 1.05 2.55 2.55 1.05-2.55 1.05-1.05 2.55-1.05-2.55L9.6 10.7l2.55-1.05 1.05-2.55Z" /><path className="collection-spark" d="m17.4 5 .38.92.92.38-.92.38-.38.92-.38-.92-.92-.38.92-.38.38-.92Z" /></svg>; }

function ChatLoading() {
  return <main className="chat-loading"><div className="loading-mark"><i /><i /><i /></div><p>Stepping into the character&apos;s world…</p></main>;
}

function getMessageStatus(message: ChatMessage): MessageStatus {
  if (message.status) return message.status;
  if (message.failed) return "failed";
  if (message.pending) return "sending";
  return "completed";
}

function messageStatusText(message: ChatMessage) {
  const status = getMessageStatus(message);
  if (status === "sending") return "Sending…";
  if (status === "streaming") return "Replying…";
  if (status === "cancelled") return "Stopped";
  if (status === "failed") return message.role === "user" ? "Failed to send" : "Failed to generate";
  return formatTime(message.created_at);
}

export default function ChatPage() {
  const params = useParams<{ characterId: string }>();
  const search = useSearchParams();
  const requestedConversationId = search.get("conversation");
  const router = useRouter();
  const desktopMessageStageRef = useRef<HTMLElement>(null);
  const mobileMessageStageRef = useRef<HTMLElement>(null);
  const desktopTextareaRef = useRef<HTMLTextAreaElement>(null);
  const mobileTextareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRailRef = useRef<HTMLElement>(null);
  const roleProfileRef = useRef<HTMLElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamBufferRef = useRef("");
  const activeTurnRef = useRef<{ requestId: string; assistantId: string; cancelled: boolean } | null>(null);
  const reconciliationTimersRef = useRef<number[]>([]);
  const nearBottomRef = useRef({ desktop: true, mobile: true });
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [experience, setExperience] = useState<CharacterExperience | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [models, setModels] = useState<ModelProfile[]>([]);
  const [balance, setBalance] = useState(0);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [text, setText] = useState("");
  const [generationState, setGenerationState] = useState<"idle" | "submitting" | "streaming" | "cancelling">("idle");
  const [restarting, setRestarting] = useState(false);
  const [chatStreamingEnabled, setChatStreamingEnabled] = useState(false);
  const [switchingModel, setSwitchingModel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRestart, setShowRestart] = useState(false);
  const [showProfile, setShowProfile] = useState(true);
  const [composerPanel, setComposerPanel] = useState<"model" | "role" | "pinned" | null>(null);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showScrollLatest, setShowScrollLatest] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [favorited, setFavorited] = useState<boolean | null>(null);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [showMobileProfile, setShowMobileProfile] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<"model" | "role" | "pinned" | "more" | null>(null);
  // Guest onboarding prototype (front-end mock; see lib/guest.ts)
  const [mockAuthed, setMockAuthed] = useState(true); // assume signed-in until mount to avoid flash
  const [guestGate, setGuestGate] = useState<{ reason: "typed" | "continue" | "header"; pendingText?: string } | null>(null);
  const [showNudge, setShowNudge] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showReward, setShowReward] = useState(false);

  useEffect(() => {
    const authed = Boolean(getMockAuth());
    setMockAuthed(authed);
    // Deep links land here directly — first-time guests still get the welcome step.
    // Members (incl. returning ones on a fresh device) never re-onboard.
    if (!authed && !getGuestProfile()) setShowWelcome(true);
    if (hasPendingReward()) setShowReward(true);
    // Keep auth in sync across tabs (sign in/out in one tab updates the others).
    const onStorage = (event: StorageEvent) => {
      if (event.key === "plum_mock_auth") setMockAuthed(Boolean(getMockAuth()));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const guestMode = !mockAuthed;

  const selectedModel = useMemo(
    () => models.find((item) => item.profile === conversation?.model_profile),
    [models, conversation?.model_profile],
  );
  const generating = generationState !== "idle";
  const canStopGeneration = generating && chatStreamingEnabled;
  const sending = generating || restarting;
  const visibleMessages = useMemo(
    () => messages.filter((message) => !(message.role === "user" && message.content === CONTINUE_PROMPT)),
    [messages],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      let conversationId = requestedConversationId;
      if (!conversationId) {
        const created = await createConversation(params.characterId);
        conversationId = created.conversation.id;
        router.replace(`/chat/${params.characterId}?conversation=${conversationId}`);
      }
      const [detail, bootstrap, conversationHistory] = await Promise.all([
        getConversation(conversationId),
        getBootstrap(),
        getConversationHistory(),
      ]);
      setConversation(detail.conversation);
      setMessages(detail.messages);
      setModels(detail.models);
      setBalance(detail.wallet.balance);
      setUser(bootstrap.user);
      setHistory(conversationHistory.items);
      setExperience(detail.experience);
      setChatStreamingEnabled(bootstrap?.capabilities?.chat_streaming === true);
      setLiked(null);
      setFavorited(null);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        router.replace("/?login=1");
        return;
      }
      setError("Chat failed to load. Go back and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [params.characterId, requestedConversationId]);
  useEffect(() => {
    const stages = [
      ["desktop", desktopMessageStageRef.current],
      ["mobile", mobileMessageStageRef.current],
    ] as const;
    stages.forEach(([kind, stage]) => {
      if (!stage || !stage.getClientRects().length || !nearBottomRef.current[kind]) return;
      stage.scrollTo({ top: stage.scrollHeight, behavior: generationState === "streaming" ? "auto" : "smooth" });
    });
  }, [messages, generationState]);
  useEffect(() => {
    function collapseHistoryIfItOverlapsProfile() {
      if (!historyOpen || !historyRailRef.current || !roleProfileRef.current) return;
      const rail = historyRailRef.current.getBoundingClientRect();
      const profile = roleProfileRef.current.getBoundingClientRect();
      if (rail.right + 8 > profile.left) setHistoryOpen(false);
    }
    window.addEventListener("resize", collapseHistoryIfItOverlapsProfile);
    return () => window.removeEventListener("resize", collapseHistoryIfItOverlapsProfile);
  }, [historyOpen]);
  useEffect(() => () => {
    abortRef.current?.abort();
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    reconciliationTimersRef.current.forEach((timer) => clearTimeout(timer));
  }, []);

  function redirectIfUnauthorized(requestError: unknown) {
    if (requestError instanceof ApiError && requestError.status === 401) {
      router.replace("/?login=1");
      return true;
    }
    return false;
  }

  function focusVisibleComposer() {
    const visibleTextarea = [mobileTextareaRef.current, desktopTextareaRef.current]
      .find((element) => element && element.getClientRects().length > 0);
    visibleTextarea?.focus();
  }

  function flushAssistantBuffer(assistantId: string) {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    const delta = streamBufferRef.current;
    streamBufferRef.current = "";
    if (!delta) return;
    setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: item.content + delta } : item));
  }

  function appendAssistantDelta(assistantId: string, delta: string) {
    if (!delta || activeTurnRef.current?.cancelled) return;
    streamBufferRef.current += delta;
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const buffered = streamBufferRef.current;
      streamBufferRef.current = "";
      if (!buffered || activeTurnRef.current?.cancelled) return;
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: item.content + buffered, status: "streaming" } : item));
    });
  }

  function stopGeneration() {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn || generationState === "cancelling") return;
    activeTurn.cancelled = true;
    flushAssistantBuffer(activeTurn.assistantId);
    setGenerationState("cancelling");
    setMessages((current) => current.map((item) => {
      if (item.id === activeTurn.assistantId) return { ...item, status: "cancelled" };
      if (item.id === activeTurn.requestId && getMessageStatus(item) === "sending") return { ...item, status: "completed" };
      return item;
    }));
    const controller = abortRef.current;
    const conversationId = conversation?.id;
    let finalized = false;
    const finalizeStop = () => {
      if (finalized) return;
      finalized = true;
      controller?.abort();
      if (!conversationId) return;
      [700, 1800].forEach((delay) => {
        const timer = window.setTimeout(() => {
          void getConversation(conversationId)
            .then((detail) => setBalance(detail.wallet.balance))
            .catch(() => undefined);
        }, delay);
        reconciliationTimersRef.current.push(timer);
      });
    };
    const fallbackTimer = window.setTimeout(finalizeStop, 500);
    if (!conversationId) {
      finalizeStop();
      return;
    }
    void cancelTurn(conversationId, activeTurn.requestId)
      .then((result) => setBalance(result.wallet.balance))
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(fallbackTimer);
        finalizeStop();
      });
  }

  async function selectModel(profile: ModelProfile["profile"]) {
    if (!conversation || sending || switchingModel || profile === conversation.model_profile) return;
    const previous = conversation;
    setConversation({ ...conversation, model_profile: profile });
    setSwitchingModel(true);
    try {
      const result = await updateModel(conversation.id, profile);
      setConversation(result.conversation);
    } catch (modelError) {
      setConversation(previous);
      if (redirectIfUnauthorized(modelError)) return;
      setError("Failed to switch model. Please try again.");
    } finally {
      setSwitchingModel(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    if (guestMode && getGuestQuota().typed >= GUEST_LIMITS.typed) {
      setGuestGate({ reason: "typed", pendingText: content });
      return;
    }
    setShowNudge(false);
    setText("");
    const ok = await sendMessage(content);
    if (ok && guestMode) bumpGuestQuota("typed"); // only consume quota on successful sends
  }

  async function sendGuestContinue() {
    if (sending || switchingModel) return;
    if (!canGuestContinue(params.characterId)) {
      setGuestGate({ reason: "continue" });
      return;
    }
    setShowNudge(false);
    const ok = await sendMessage(CONTINUE_PROMPT);
    if (!ok) return;
    const next = bumpGuestQuota("continues", params.characterId);
    if (next.continues >= GUEST_LIMITS.nudgeAtContinue && !wasNudged()) {
      markNudged();
      setShowNudge(true);
    }
  }

  function afterGateSignIn() {
    setMockAuthed(true);
    if (hasPendingReward()) setShowReward(true);
    const gate = guestGate;
    setGuestGate(null);
    if (gate?.pendingText) { setText(""); void sendMessage(gate.pendingText); }
    else if (gate?.reason === "continue") void sendMessage(CONTINUE_PROMPT);
  }

  async function sendMessage(content: string): Promise<boolean> {
    if (!conversation || !content || sending || switchingModel || !selectedModel) return false;
    if (balance < selectedModel.coin_cost) {
      setError("Not enough coins to send this message.");
      return false;
    }
    const requestId = crypto.randomUUID();
    const assistantId = `local-assistant:${requestId}`;
    const controller = new AbortController();
    let accepted = false;
    let failed = false;
    setMessages((current) => [
      ...current,
      { id: requestId, message_id: requestId, role: "user", content, status: "sending" },
      { id: assistantId, role: "assistant", content: "", status: "sending" },
    ]);
    streamBufferRef.current = "";
    abortRef.current = controller;
    activeTurnRef.current = { requestId, assistantId, cancelled: false };
    setGenerationState("submitting");
    setError(null);
    try {
      if (chatStreamingEnabled) {
        await sendTurnStream({
          conversationId: conversation.id,
          text: content,
          requestId,
          signal: controller.signal,
          onEvent: (streamEvent) => {
            if (activeTurnRef.current?.requestId !== requestId || activeTurnRef.current.cancelled) return;
            if (streamEvent.type === "turn.accepted") {
              accepted = true;
              setGenerationState("streaming");
              setMessages((current) => current.map((item) => item.id === requestId
                ? { ...item, status: "completed" }
                : item.id === assistantId ? { ...item, status: "streaming" } : item));
            } else if (streamEvent.type === "message.delta") {
              setGenerationState("streaming");
              appendAssistantDelta(assistantId, streamEvent.text);
            } else if (streamEvent.type === "turn.completed") {
              flushAssistantBuffer(assistantId);
              setBalance(streamEvent.wallet.balance);
              setMessages((current) => current.map((item) => item.id === assistantId ? {
                ...item,
                id: streamEvent.message_id ?? item.id,
                message_id: streamEvent.message_id,
                status: "completed",
              } : item));
            } else if (streamEvent.type === "turn.cancelled") {
              flushAssistantBuffer(assistantId);
              setBalance(streamEvent.wallet.balance);
              setMessages((current) => current.map((item) => item.id === assistantId ? {
                ...item,
                id: streamEvent.message_id ?? item.id,
                message_id: streamEvent.message_id,
                status: "cancelled",
              } : item));
            } else if (streamEvent.type === "turn.failed") {
              failed = true;
              flushAssistantBuffer(assistantId);
              setBalance(streamEvent.wallet.balance);
              setMessages((current) => current.map((item) => item.id === assistantId
                ? { ...item, status: "failed" }
                : item.id === requestId ? { ...item, status: accepted ? "completed" : "failed" } : item));
              if (content !== CONTINUE_PROMPT) setText((current) => current || content);
              setError("Failed to generate a response. Please try again.");
            }
          },
        });
      } else {
        const result = await sendTurn(conversation.id, content, requestId);
        setMessages((current) => current.map((item) => item.id === requestId
          ? { ...item, status: "completed" }
          : item.id === assistantId ? {
            ...item,
            id: result.reply.message_id ?? item.id,
            message_id: result.reply.message_id,
            content: result.reply.text,
            status: "completed",
          } : item));
        setBalance(result.wallet.balance);
      }
    } catch (sendError) {
      if (controller.signal.aborted) return true; // user stopped generation — the turn was accepted and charged
      failed = true;
      flushAssistantBuffer(assistantId);
      setMessages((current) => current.map((item) => item.id === assistantId
        ? { ...item, status: "failed" }
        : item.id === requestId ? { ...item, status: accepted ? "completed" : "failed" } : item));
      if (redirectIfUnauthorized(sendError)) return false;
      setError(sendError instanceof Error && sendError.message === "insufficient_coins" ? "Not enough coins." : "The message or response was interrupted. Please try again.");
      if (content !== CONTINUE_PROMPT) setText((current) => current || content);
    } finally {
      if (activeTurnRef.current?.requestId === requestId) activeTurnRef.current = null;
      if (abortRef.current === controller) abortRef.current = null;
      setGenerationState("idle");
      focusVisibleComposer();
    }
    return !failed;
  }

  async function confirmRestart() {
    if (!conversation || sending || switchingModel) return;
    setRestarting(true);
    try {
      const result = await restartConversation(conversation.id);
      setConversation(result.conversation);
      setMessages([]);
      setBalance(result.wallet.balance);
      setExperience(result.experience);
      setShowRestart(false);
      router.replace(`/chat/${params.characterId}?conversation=${result.conversation.id}`);
    } catch (restartError) {
      if (redirectIfUnauthorized(restartError)) return;
      setError("Failed to restart. Please try again later.");
    } finally {
      setRestarting(false);
    }
  }

  async function signOut() {
    try { await logout(); } catch { /* an expired session is already signed out */ }
    mockSignOut();
    router.replace("/");
  }

  if (loading) return <ChatLoading />;
  if (!conversation || !experience) {
    return <main className="fatal-state"><h1>Conversation not found</h1><p>{error}</p><button onClick={() => router.push("/")}>Back to characters</button></main>;
  }

  const character = conversation.character;
  const cover = character.cover_ref ?? "/characters/kai.svg";
  const displayName = character.display_name;
  const tagline = character.tagline;
  const { profile, viewer_state: viewerState, conversation_tools: conversationTools } = experience;
  const primaryBadge = profile.badges[0];
  const viewerHasLiked = liked ?? viewerState.has_liked;
  const viewerHasFavorited = favorited ?? viewerState.is_favorite;
  const visibleLikeCount = viewerState.like_count + Number(viewerHasLiked) - Number(viewerState.has_liked);
  const visibleFavoriteCount = viewerState.favorite_count + Number(viewerHasFavorited) - Number(viewerState.is_favorite);
  const inspirationPrompts = experience.inspiration_prompts.map((prompt) => prompt.replace("{{character}}", displayName));

  function scrollToLatest() {
    nearBottomRef.current = { desktop: true, mobile: true };
    [desktopMessageStageRef.current, mobileMessageStageRef.current].forEach((stage) => {
      if (stage?.getClientRects().length) stage.scrollTo({ top: stage.scrollHeight, behavior: "smooth" });
    });
    setShowScrollLatest(false);
  }

  function useInspiration() {
    const currentIndex = inspirationPrompts.indexOf(text);
    setText(inspirationPrompts[(currentIndex + 1) % inspirationPrompts.length]);
    requestAnimationFrame(focusVisibleComposer);
  }

  async function shareCharacter() {
    const shareData = { title: displayName, text: tagline, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Closing the native share sheet is not an error the UI needs to surface.
    }
  }

  async function toggleLike() {
    if (reactionBusy) return;
    const next = !viewerHasLiked;
    setLiked(next);
    setReactionBusy(true);
    try {
      const result = await setCharacterLike(character.id, next);
      setExperience((current) => current ? {
        ...current,
        viewer_state: {
          ...current.viewer_state,
          has_liked: result.active,
          like_count: result.count,
        },
      } : current);
      setLiked(null);
    } catch (likeError) {
      setLiked(null);
      if (redirectIfUnauthorized(likeError)) return;
      setError("Could not save your like. Please try again.");
    } finally {
      setReactionBusy(false);
    }
  }

  async function toggleFavorite() {
    if (reactionBusy) return;
    const next = !viewerHasFavorited;
    setFavorited(next);
    setReactionBusy(true);
    try {
      const result = await setCharacterFavorite(character.id, next);
      setExperience((current) => current ? {
        ...current,
        viewer_state: {
          ...current.viewer_state,
          is_favorite: result.active,
          favorite_count: result.count,
        },
      } : current);
      setFavorited(null);
    } catch (favoriteError) {
      setFavorited(null);
      if (redirectIfUnauthorized(favoriteError)) return;
      setError("Could not save your favorite. Please try again.");
    } finally {
      setReactionBusy(false);
    }
  }

  return (
    <main className="reference-chat-shell" style={{ "--accent": character.accent_color } as React.CSSProperties}>
      <Image className="chat-world-bg" src={cover} alt="" fill priority sizes="(min-width: 768px) 100vw, 1px" />
      <div className="chat-world-overlay" />

      <section className="mobile-chat-shell" aria-label={`${displayName} mobile chat`}>
        <Image className="mobile-chat-background" src={cover} alt="" fill priority sizes="(max-width: 767px) 100vw, 1px" />
        <div className="mobile-chat-shade" />

        <header className="mobile-chat-header">
          <button className="mobile-round-button" onClick={() => router.push("/")} aria-label="Back to characters"><BackIcon /></button>
          <button className="mobile-character-button" onClick={() => setShowMobileProfile(true)} aria-label="View profile">
            <span><Image src={cover} alt="" fill sizes="34px" /></span>
            <b>{displayName}</b>
            {primaryBadge && <i title={primaryBadge.display_name}>✦</i>}
          </button>
          <button className="mobile-round-button mobile-header-more" onClick={() => setMobileSheet("more")} aria-label="More settings"><MoreIcon /></button>
        </header>

        <section
          className="mobile-message-stage"
          ref={mobileMessageStageRef}
          onScroll={(event) => {
            const stage = event.currentTarget;
            const nearBottom = stage.scrollHeight - stage.scrollTop - stage.clientHeight <= 72;
            nearBottomRef.current.mobile = nearBottom;
            setShowScrollLatest(!nearBottom);
          }}
        >
          <div className="mobile-message-list">
            <p className="mobile-ai-notice">All responses are AI-generated. Characters are depicted as adults aged 18 or above.</p>
            <p className="mobile-encryption-note">Your chats and accounts are encrypted.</p>
            <div className="mobile-tagline"><b>Tagline:</b> “{tagline}”</div>
            <div className="mobile-opening">{character.greeting}</div>

            {visibleMessages.map((message) => {
              const status = getMessageStatus(message);
              const waiting = !message.content && (status === "sending" || status === "streaming");
              return (
              <div className={`mobile-message-row ${message.role}${status === "failed" ? " failed" : status === "cancelled" ? " cancelled" : ""}`} key={`mobile-${message.id}`}>
                {message.role === "assistant" && <span className="mobile-message-avatar"><Image src={cover} alt="" fill sizes="28px" /></span>}
                <div className="mobile-message-stack">
                  {waiting
                    ? <div className="typing"><i /><i /><i /></div>
                    : <div className="mobile-bubble">{message.content || (status === "cancelled" ? "Response stopped" : "Response failed")}</div>}
                  <small>{messageStatusText(message)}</small>
                </div>
              </div>
            );})}
            {showNudge && <div className="guest-nudge">*{displayName} looks straight at you, waiting.* &ldquo;Answer me.&rdquo;</div>}
          </div>
          {showScrollLatest && <button className="mobile-scroll-latest" onClick={scrollToLatest} aria-label="Back to latest"><ScrollLatestIcon /></button>}
        </section>

        <section className="mobile-composer-panel">
          {error && <div className="mobile-composer-error">{error}<button onClick={() => setError(null)}>×</button></div>}
          {guestMode && (
            <div className="guest-continue">
              <button onClick={() => void sendGuestContinue()} disabled={sending || switchingModel}>Continue<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
            </div>
          )}
          <div className="mobile-tool-row">
            {guestMode
              ? <span className="mobile-card-pill"><RoleIcon /><span className="mobile-card-pill-label">Free model</span></span>
              : <button className="mobile-card-pill" onClick={() => setMobileSheet("model")} aria-label="Switch model"><RoleIcon /><span className="mobile-card-pill-label">{modelName(selectedModel) ?? "Model"}</span></button>}
            <button className="mobile-card-pill" onClick={() => setMobileSheet("pinned")} aria-label="View pinned memories"><CommentIcon /><span className="mobile-card-pill-label">Pinned</span></button>
          </div>
          <form className={`mobile-composer${showNudge ? " composer-attention" : ""}`} onSubmit={submit}>
            <button type="button" className="mobile-inspire-btn" aria-label="Get inspiration" onClick={useInspiration}><InspirationIcon /></button>
            <textarea
              ref={mobileTextareaRef}
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 2000))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Type a message..."
              rows={1}
              disabled={restarting || switchingModel}
            />
            <button
              type={canStopGeneration ? "button" : "submit"}
              className={`mobile-send${canStopGeneration ? " is-stopping" : ""}`}
              disabled={restarting || switchingModel || generationState === "cancelling" || (generating && !canStopGeneration) || (!generating && !text.trim())}
              onClick={canStopGeneration ? stopGeneration : undefined}
              aria-label={canStopGeneration ? "Stop generating" : "Send message"}
            >{canStopGeneration ? <StopIcon /> : <SendIcon />}</button>
          </form>
        </section>

        {showMobileProfile && (
          <div className="mobile-sheet-backdrop" onClick={() => setShowMobileProfile(false)}>
            <aside className="mobile-profile-sheet" onClick={(event) => event.stopPropagation()} aria-label={`${displayName} profile`}>
              <div className="mobile-sheet-handle" />
              <header className="mobile-profile-actions">
                <button className="mobile-cid">CID: {character.id.replace("char_", "").slice(0, 5)}… <span>▣</span></button>
                <button onClick={() => void shareCharacter()} aria-label="Share character"><ShareIcon /></button>
                <button onClick={() => setShowMobileProfile(false)} aria-label="Close profile"><CloseIcon /></button>
              </header>
              <div className="mobile-profile-scroll">
                <section className="mobile-profile-hero">
                  <span><Image src={cover} alt={displayName} fill sizes="82px" /></span>
                  <div className="mobile-profile-social">
                    <button className={viewerHasLiked ? "active" : ""} disabled={reactionBusy} onClick={() => void toggleLike()}><ThumbIcon /><b>{visibleLikeCount}</b><small>Likes</small></button>
                    <button className={viewerHasFavorited ? "active" : ""} disabled={reactionBusy} onClick={() => void toggleFavorite()}><HeartIcon /><b>{visibleFavoriteCount}</b><small>Favorites</small></button>
                  </div>
                </section>
                <h1>{displayName}{primaryBadge && <i title={primaryBadge.display_name}>✦</i>}</h1>
                <div className="mobile-profile-tags">{profile.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                <section className="mobile-profile-stats">
                  <div><small>Creator</small><strong><i>{profile.creator.display_name.slice(0, 1).toUpperCase()}</i>{profile.creator.display_name}</strong></div>
                  <div><small>Interactions</small><strong>{formatCompactCount(profile.stats.interaction_count)}</strong></div>
                  <div><small>Connectors</small><strong>{formatCompactCount(profile.stats.connector_count)}</strong></div>
                </section>
                <section className="mobile-profile-copy"><small>Tagline</small><p>“{tagline}”</p></section>
                <section className="mobile-profile-copy"><small>Greeting</small><p>{character.greeting}</p></section>
              </div>
            </aside>
          </div>
        )}

        {mobileSheet && (
          <div className="mobile-sheet-backdrop mobile-tool-backdrop" onClick={() => setMobileSheet(null)}>
            <section className="mobile-tool-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="mobile-sheet-handle" />
              <header><b>{mobileSheet === "model" ? "Story model" : mobileSheet === "role" ? "Role Card" : mobileSheet === "pinned" ? "Pinned" : "Chat settings"}</b><button onClick={() => setMobileSheet(null)}><CloseIcon /></button></header>
              {mobileSheet === "model" && <div className="mobile-model-list">{models.map((model) => (
                <button key={model.profile} className={model.profile === conversation.model_profile ? "selected" : ""} disabled={sending || switchingModel} onClick={() => { void selectModel(model.profile); setMobileSheet(null); }}><span><b>{modelName(model)}</b><small>{model.coin_cost} coins / message</small></span><i>{model.profile === conversation.model_profile ? "✓" : ""}</i></button>
              ))}</div>}
              {mobileSheet === "role" && <div className="mobile-sheet-copy">{conversationTools.role_card ? <><span className="test-user-avatar">{conversationTools.role_card.display_name.slice(0, 1).toUpperCase()}</span><div><b>{conversationTools.role_card.display_name}</b><p>{conversationTools.role_card.description}</p></div></> : <p>No role card selected</p>}</div>}
              {mobileSheet === "pinned" && <div className="mobile-sheet-list">{conversationTools.pins.length === 0 ? <p><NoteIcon />No pinned memories</p> : conversationTools.pins.map((pin) => <p key={pin.id}>{pin.content}</p>)}</div>}
              {mobileSheet === "more" && <div className="mobile-sheet-menu"><button onClick={() => { setMobileSheet(null); setShowMobileProfile(true); }}><RoleIcon /><span><b>Character profile</b><small>View story details and memories</small></span></button><button onClick={() => { setMobileSheet(null); void shareCharacter(); }}><ShareIcon /><span><b>Share character</b><small>Copy a link to this character</small></span></button><button onClick={() => { setMobileSheet(null); setShowRestart(true); }}><RestartIcon /><span><b>Restart story</b><small>Archive this chat and begin again</small></span></button></div>}
            </section>
          </div>
        )}
      </section>

      <header className="tipsy-header chat-site-header">
        <div className="header-brand-group"><Brand /><Link className="community-link" href="/community"><CommunityIcon /><span>Community</span></Link></div>
        <div className="tipsy-header-right">
          <button className="header-circle" aria-label="Search" onClick={() => router.push("/?search=1")}><SearchIcon /></button>
          <button className="header-circle" aria-label="Create" title="Create" onClick={() => router.push("/create/v1")}><CreateIcon /></button>
          <div className="header-menu-wrap"><button className="header-circle language-symbol" aria-label="Switch language" aria-expanded={languageOpen} onClick={() => setLanguageOpen((value) => !value)}><TranslationIcon /></button>{languageOpen && <div className="header-dropdown language-menu"><button className="selected">简体中文 <span>✓</span></button><button>English</button><small>More languages coming soon</small></div>}</div>
          {mockAuthed && <div className="header-menu-wrap"><button className="coin-button" onClick={() => setWalletOpen((value) => !value)} aria-label={`Coin balance ${balance}`}><span>✦</span><strong>{balance.toLocaleString("en-US")}</strong></button>{walletOpen && <div className="header-dropdown wallet-panel"><small>Coin balance</small><strong>{balance.toLocaleString("en-US")}</strong><h3>Transaction history</h3><p>No transactions yet</p><button disabled>Top-up · coming soon</button></div>}</div>}
          {user && mockAuthed ? <div className="header-menu-wrap"><button className="account-button" onClick={() => setAccountOpen((value) => !value)} aria-label="Account settings"><i>{(getUserName() ?? user.display_name).slice(0, 1).toUpperCase()}</i><span>{getUserName() ?? user.display_name}</span><b>⌄</b></button>{accountOpen && <div className="header-dropdown account-menu"><button disabled>Account settings · coming soon</button><button onClick={() => void signOut()}>Sign out</button></div>}</div> : <button className="feed-signin-button" onClick={() => setGuestGate({ reason: "header" })}>Sign in</button>}
        </div>
      </header>

      {user && history.length > 0 && <aside ref={historyRailRef} className={`chat-history-rail${historyOpen ? " open" : ""}`} aria-label="Collections">
        <button className="history-toggle" onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen} aria-label={historyOpen ? "Collapse Collections" : "Open Collections"} title="Collections"><CollectionsIcon /></button>
        <div className="history-list">{history.map((item) => {
          const active = item.id === conversation.id;
          const avatar = item.character.avatar_ref ?? item.character.cover_ref ?? "/characters/kai.svg";
          return <button className={`history-item${active ? " active" : ""}`} key={item.id} disabled={active || sending} onClick={() => router.push(`/chat/${item.character_id}?conversation=${item.id}`)} aria-label={`Open chat with ${item.character.display_name}`}>
            <span className="history-avatar"><Image src={avatar} alt="" fill sizes="42px" /></span>
            <span className="history-copy"><strong>{item.character.display_name}</strong><small>{item.character.tagline}</small></span>
          </button>;
        })}</div>
      </aside>}

      <div className={`reference-chat-workspace${showProfile ? "" : " profile-collapsed"}`}>
        {showProfile && (
          <aside ref={roleProfileRef} className="role-profile" aria-label={`${displayName} profile`}>
            <Image className="role-profile-cover" src={cover} alt={`${displayName} profile`} fill priority sizes="350px" />
            <div className="profile-image-shade" />
            <div className="profile-top-actions">
              <button className="profile-icon-action" aria-label="Share character" title="Share character" onClick={() => void shareCharacter()}><ShareIcon /></button>
              <button className="profile-icon-action" aria-label="Collapse profile" title="Collapse profile" onClick={() => setShowProfile(false)}><CollapseProfileIcon /></button>
            </div>

            <div className="profile-hover-content">
              <section className="hover-profile-identity">
                <span className="profile-avatar"><Image src={cover} alt="" fill sizes="68px" /></span>
                <div>
                  <h1>{displayName}{primaryBadge && <i title={primaryBadge.display_name} aria-label={primaryBadge.display_name}>✦</i>}</h1>
                  <div className="profile-tag-list">{profile.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                </div>
              </section>

              <section className="profile-stats-card">
                <div className="profile-creator-stat"><small>Creator</small><span><i>{profile.creator.display_name.slice(0, 1).toUpperCase()}</i><b>{profile.creator.display_name}</b></span></div>
                <div><small>Interactions</small><strong>{formatCompactCount(profile.stats.interaction_count)}</strong></div>
                <div><small>Connectors</small><strong>{formatCompactCount(profile.stats.connector_count)}</strong></div>
              </section>

              <p className="profile-bottom-tagline">“{tagline}”</p>
            </div>
          </aside>
        )}

        <section className="reference-conversation">
          <header className="reference-conversation-toolbar">
            <div className="conversation-character-status">
              <button className="conversation-avatar" onClick={() => setShowProfile(true)} aria-label="Show profile"><Image src={cover} alt={displayName} fill sizes="48px" /></button>
              <span className="conversation-character-name" style={{ color: "#FFFFFF", fontWeight: "bold", fontSize: "20px" }}>{displayName}</span>
            </div>
            <div className="conversation-toolbar-actions">
              <button className="more-pill has-tooltip" data-tooltip="Layout & settings" onClick={() => setShowChatMenu((value) => !value)} aria-label="Layout & settings"><MoreIcon /></button>
            </div>
            {showChatMenu && (
              <div className="chat-settings-popover">
                <button onClick={() => { setShowProfile(true); setShowChatMenu(false); }}><span>↺</span><div><b>Reset layout</b><small>Show profile and standard chat width</small></div></button>
                <button onClick={() => { setShowChatMenu(false); setShowRestart(true); }}><span>＋</span><div><b>Restart conversation</b><small>Archive this chat and start fresh</small></div></button>
              </div>
            )}
          </header>

          <section
            className="reference-message-stage"
            ref={desktopMessageStageRef}
            onScroll={(event) => {
              const stage = event.currentTarget;
              const nearBottom = stage.scrollHeight - stage.scrollTop - stage.clientHeight <= 72;
              nearBottomRef.current.desktop = nearBottom;
              setShowScrollLatest(!nearBottom);
            }}
          >
            <div className="reference-message-list">
              <p className="ai-notice">All responses are AI-generated. All characters are depicted as adults aged 18 or above.</p>
              <p className="encryption-note">Your chats and accounts are encrypted.</p>
              <div className="tagline-note"><b>Tagline:</b> “{tagline}”</div>

              <div className="reference-opening">{character.greeting}</div>

              {visibleMessages.map((message) => {
                const status = getMessageStatus(message);
                const waiting = !message.content && (status === "sending" || status === "streaming");
                return (
                <div className={`reference-message-row ${message.role}${status === "failed" ? " failed" : status === "cancelled" ? " cancelled" : ""}`} key={message.id}>
                  {message.role === "assistant" && <span className="reference-message-avatar"><Image src={cover} alt="" fill sizes="30px" /></span>}
                  <div className="reference-message-stack">
                    {waiting
                      ? <div className="typing"><i /><i /><i /></div>
                      : <div className="reference-bubble">{message.content || (status === "cancelled" ? "Response stopped" : "Response failed")}</div>}
                    <small>{messageStatusText(message)}</small>
                  </div>
                </div>
              );})}
              {showNudge && <div className="guest-nudge">*{displayName} looks straight at you, waiting.* &ldquo;Answer me.&rdquo;</div>}
            </div>
            {showScrollLatest && <button className="scroll-latest has-tooltip" data-tooltip="Back to latest" onClick={scrollToLatest} aria-label="Back to latest"><ScrollLatestIcon /></button>}
          </section>

          <section className="reference-composer-panel">
            {error && <div className="composer-error">{error}<button onClick={() => setError(null)}>×</button></div>}
            {composerPanel === "model" && (
              <div className="composer-popover model-popover">
                <header><b>Story model</b><small>Choose the model for this conversation</small></header>
                {models.map((model) => (
                  <button
                    key={model.profile}
                    className={model.profile === conversation.model_profile ? "selected" : ""}
                    disabled={sending || switchingModel}
                    onClick={() => { void selectModel(model.profile); setComposerPanel(null); }}
                  >
                    <span><b>{modelName(model)}</b><small>{model.coin_cost} coins / message</small></span>
                    <i>{model.profile === conversation.model_profile ? "✓" : ""}</i>
                  </button>
                ))}
              </div>
            )}
            {composerPanel === "role" && (
              <div className="composer-popover info-popover">
                <header><b>Role Card</b><button onClick={() => setComposerPanel(null)}>×</button></header>
                {conversationTools.role_card ? (
                  <><p><span className="test-user-avatar">{conversationTools.role_card.display_name.slice(0, 1).toUpperCase()}</span><strong>{conversationTools.role_card.display_name}</strong></p><small>{conversationTools.role_card.description} Using a default test identity for now; editable role cards coming soon.</small></>
                ) : <p className="empty-pin"><RoleIcon /><strong>No role card selected</strong></p>}
              </div>
            )}
            {composerPanel === "pinned" && (
              <div className="composer-popover info-popover">
                <header><b>Pinned</b><button onClick={() => setComposerPanel(null)}>×</button></header>
                {conversationTools.pins.length === 0 ? <p className="empty-pin"><NoteIcon /><strong>No pinned memories</strong></p> : conversationTools.pins.map((pin) => <p key={pin.id}>{pin.content}</p>)}
                <small>Pinned notes act as long-term facts in later turns. (Fallback build: not yet written into model context.)</small>
              </div>
            )}
            {guestMode && (
              <div className="guest-continue">
                <button onClick={() => void sendGuestContinue()} disabled={sending || switchingModel}>Continue<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
              </div>
            )}
            <div className="composer-tools">
              {guestMode
                ? <span className="chat-card-pill"><RoleIcon /><span className="chat-card-pill-label">Free model</span></span>
                : <button className="chat-card-pill has-tooltip" data-tooltip={selectedModel ? `${modelName(selectedModel)} · ${selectedModel.coin_cost} coins` : "Select model"} onClick={() => setComposerPanel(composerPanel === "model" ? null : "model")} aria-label="Select model"><RoleIcon /><span className="chat-card-pill-label">{modelName(selectedModel) ?? "Model"}</span></button>}
              <button className="chat-card-pill" onClick={() => setComposerPanel(composerPanel === "pinned" ? null : "pinned")}><CommentIcon /><span className="chat-card-pill-label">Pinned</span></button>
            </div>
            <form className={`reference-composer${showNudge ? " composer-attention" : ""}`} onSubmit={submit}>
              <button type="button" className="inspiration-button has-tooltip" data-tooltip="Inspiration" aria-label="Get inspiration" onClick={useInspiration}><InspirationIcon /></button>
              <textarea
                ref={desktopTextareaRef}
                value={text}
                onChange={(event) => setText(event.target.value.slice(0, 2000))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Enter to send，shift+enter for new line"
                rows={1}
                disabled={restarting || switchingModel}
              />
              <button
                type={canStopGeneration ? "button" : "submit"}
                className={`reference-send${canStopGeneration ? " is-stopping" : ""}`}
                disabled={restarting || switchingModel || generationState === "cancelling" || (generating && !canStopGeneration) || (!generating && !text.trim())}
                onClick={canStopGeneration ? stopGeneration : undefined}
                aria-label={canStopGeneration ? "Stop generating" : "Send message"}
              >{canStopGeneration ? <StopIcon /> : <SendIcon />}</button>
            </form>
          </section>
        </section>
      </div>

      <footer className="chat-reference-footer"><span>Supported Cards</span><a>Privacy Policy</a><a>Terms of Service</a><a>Community Guidelines</a><a>About Us</a><small>© 2026 PLUM</small></footer>

      {showRestart && (
        <div className="modal-backdrop" onClick={() => setShowRestart(false)}>
          <div className="restart-modal" onClick={(event) => event.stopPropagation()}>
            <span className="modal-icon">↺</span><h2>Restart this relationship?</h2>
            <p>The current chat will be archived and a new conversation will start from the character&apos;s greeting.</p>
            <div><button className="secondary" onClick={() => setShowRestart(false)}>Cancel</button><button className="danger" disabled={sending} onClick={() => void confirmRestart()}>Restart</button></div>
          </div>
        </div>
      )}

      {showWelcome && <WelcomeModal onDone={() => setShowWelcome(false)} />}

      {guestGate && !showWelcome && (
        <div className="gate-overlay" role="dialog" aria-modal="true" aria-label="Sign in to continue" onClick={() => { if (guestGate.reason === "header") setGuestGate(null); }}>
          <div className="gate-stack" onClick={(event) => event.stopPropagation()}>
            {guestGate.reason !== "header" && (
              <div className="gate-teaser-row">
                <span className="gate-teaser-avatar"><Image src={cover} alt="" fill sizes="34px" /></span>
                <div className="gate-teaser">
                  <p>{displayName} leans in, voice dropping to a whisper meant only for you. &ldquo;I was hoping you&rsquo;d say that. Because there&rsquo;s something I should have told you the moment you walked in&hellip;&rdquo;</p>
                  <div className="gate-teaser-typing"><i /><i /><i /></div>
                </div>
              </div>
            )}
            <SignInCard heading={guestGate.reason === "header" ? "Sign in to Plum" : "Sign in to continue this story"} subheading="Fun, interactive characters to keep you company — sign in and pick up right where you left off." onSignedIn={afterGateSignIn} />
            <button className="gate-dismiss" onClick={() => setGuestGate(null)}>Not now</button>
          </div>
        </div>
      )}

      {showReward && <SignInReward coins={SIGNIN_REWARD_COINS} onClaim={() => { clearPendingReward(); setShowReward(false); }} />}
    </main>
  );
}
