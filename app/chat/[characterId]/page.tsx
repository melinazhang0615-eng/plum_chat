"use client";

import Image from "next/image";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Brand } from "@/components/brand";
import { CommunityLink } from "@/components/community-link";
import { EmailSignInDialog, PlumAuthProvider, WelcomeDialog, usePlumAuth } from "@/components/plum-auth";
import { ApiError, cancelTurn, createConversation, createConversationPin, getAuthContext, getConversation, getConversationHistory, logout, restartConversation, sendTurn, sendTurnStream, setCharacterFavorite, setCharacterLike, updateConversationPin, updateModel } from "@/lib/api";
import { formatCompactCount } from "@/lib/format";
import type { AuthUser, CharacterExperience, ChatMessage, Conversation, ConversationPin, GuestQuota, MessageStatus, ModelProfile } from "@/lib/types";
import { BackIcon, CloseIcon, CollapseProfileIcon, CollectionsIcon, CommentIcon, ContinueIcon, CopyIcon, CreateIcon, EditIcon, HeartIcon, HelpIcon, InspirationIcon, MemoryIcon, MoreIcon, NoteIcon, PlusIcon, RestartIcon, RoleIcon, ScrollLatestIcon, SearchIcon, SendIcon, ShareIcon, ThumbIcon, TranslationIcon } from "@/components/icons";

function formatTime(value?: string) {
  if (!value) return "Just now";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "+08:00";
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "Just now" : date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const MODEL_LABELS: Record<string, string> = { fast: "Fast", balanced: "Balanced", immersive: "Immersive" };
const modelName = (m?: { profile: string; display_name: string } | null) => (m ? (MODEL_LABELS[m.profile] ?? m.display_name) : undefined);
// Guests get an empty model list from the backend (they are locked to guest_free),
// so this teaser lets them see and tap the premium models; picking one opens the
// lightweight sign-in and, once authenticated, switches to the model they wanted.
const GUEST_MODEL_TEASER: { profile: ModelProfile["profile"]; display_name: string; coin_cost: number }[] = [
  { profile: "fast", display_name: "Fast", coin_cost: 0 },
  { profile: "balanced", display_name: "Balanced", coin_cost: 0 },
  { profile: "immersive", display_name: "Immersive", coin_cost: 0 },
];

// A hand-written memory is capped at the same length the composer accepts for a
// message, so a pin written by hand cannot outgrow one saved from a reply.
const MEMORY_DRAFT_MAX = 2000;

function StopIcon() {
  return <svg viewBox="0 0 30 30" aria-hidden="true"><rect x="10" y="10" width="10" height="10" rx="1.5" /></svg>;
}
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
  if (status === "sending") return "发送中…";
  if (status === "streaming") return "正在回复…";
  if (status === "cancelled") return "已停止";
  if (status === "failed") return message.role === "user" ? "发送失败" : "生成失败";
  return formatTime(message.created_at);
}

const MEMORY_PARTICLES = 11;
const MEMORY_ARC_SAMPLES = 16;
const MEMORY_FLIGHT_MS = 1180;
const SVG_NS = "http://www.w3.org/2000/svg";
// White, varied only by how solid each one is, so the trail keeps some depth.
const MEMORY_PARTICLE_TINTS = [
  "linear-gradient(140deg, #ffffff, rgba(255,255,255,.86))",
  "linear-gradient(140deg, rgba(255,255,255,.94), rgba(255,255,255,.72))",
  "linear-gradient(140deg, rgba(255,255,255,.85), rgba(255,255,255,.6))",
  "linear-gradient(140deg, rgba(255,255,255,.74), rgba(255,255,255,.5))",
];

function ChatContent() {
  const params = useParams<{ characterId: string }>();
  const search = useSearchParams();
  const requestedConversationId = search.get("conversation");
  const router = useRouter();
  const { refresh, context } = usePlumAuth();
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
  const desktopMemoryIconRef = useRef<HTMLButtonElement>(null);
  const memoryDraftRef = useRef<HTMLTextAreaElement>(null);
  const mobileMemoryIconRef = useRef<HTMLButtonElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const memoryPulseTimerRef = useRef<number | null>(null);
  const memoryFlightTimerRef = useRef<number | null>(null);
  const longPressRef = useRef<{ timer: number | null; x: number; y: number }>({ timer: null, x: 0, y: 0 });
  const uidRef = useRef(0);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [experience, setExperience] = useState<CharacterExperience | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [models, setModels] = useState<ModelProfile[]>([]);
  const [balance, setBalance] = useState(0);
  const [guestQuota, setGuestQuota] = useState<GuestQuota | null>(null);
  const [guest, setGuest] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  // The model a guest tapped before signing in; applied automatically after auth.
  const [pendingModel, setPendingModel] = useState<ModelProfile["profile"] | null>(null);
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
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (loading) return;
    if (typeof window !== "undefined" && window.localStorage.getItem("plum_welcome_seen")) return;
    const actor = context?.actor;
    const isNewUser = actor?.kind === "visitor" || (actor?.kind === "guest" && !actor.profile_complete);
    if (!isNewUser) return;
    // New users only, once ever: show Welcome ~2s after the opening line lands in the room.
    const timer = window.setTimeout(() => {
      window.localStorage.setItem("plum_welcome_seen", "1");
      setShowWelcome(true);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [loading, context]);
  const [error, setError] = useState<string | null>(null);
  const [showRestart, setShowRestart] = useState(false);
  const [showProfile, setShowProfile] = useState(true);
  const [composerPanel, setComposerPanel] = useState<"model" | "role" | null>(null);
  const [showChatMenu, setShowChatMenu] = useState(false);
  // Anchored under the memory icon in the toolbar, not above the composer: the
  // panel has to open next to the control that opens it.
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);

  /**
   * Every popover on this page used to own its state with no shared dismissal,
   * so they stacked on top of each other and none closed on an outside click.
   * One closer + one document listener keeps them mutually exclusive.
   */
  function closeOverlays() {
    setComposerPanel(null);
    setShowChatMenu(false);
    setMemoryPanelOpen(false);
    setLanguageOpen(false);
    setWalletOpen(false);
    setAccountOpen(false);
  }
  // Memories can also be written by hand from the same top-bar control. The value
  // records which surface opened the writing view, because the two surfaces render
  // it differently: a centred dialog on desktop, a full screen page on mobile.
  const [memoryComposer, setMemoryComposer] = useState<"desktop" | "mobile" | null>(null);
  const [memoryDraft, setMemoryDraft] = useState("");
  // The pin being rewritten, or null when the draft is a new memory.
  const [memoryEditing, setMemoryEditing] = useState<ConversationPin | null>(null);
  const [memorySaving, setMemorySaving] = useState(false);
  // autoFocus alone leaves the caret at position 0, so editing an existing memory
  // typed the new text in front of the old one.
  useEffect(() => {
    if (!memoryComposer) return;
    const node = memoryDraftRef.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, [memoryComposer]);
  const [showScrollLatest, setShowScrollLatest] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [favorited, setFavorited] = useState<boolean | null>(null);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [showMobileProfile, setShowMobileProfile] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<"model" | "role" | "pinned" | "more" | null>(null);
  const [mobileCharacterBackground, setMobileCharacterBackground] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string; tone: "ok" | "info" | "error" } | null>(null);
  // A ref, not state: every state change on this page re-renders both message
  // lists (~30ms), which is not worth paying just to disable one button.
  const memoryBusyRef = useRef(false);
  const [messageMenu, setMessageMenu] = useState<{ message: ChatMessage; x: number; y: number; anchor: HTMLElement } | null>(null);

  const selectedModel = useMemo(
    () => models.find((item) => item.profile === conversation?.model_profile),
    [models, conversation?.model_profile],
  );
  const generating = generationState !== "idle";
  const canStopGeneration = generating && chatStreamingEnabled;
  const sending = generating || restarting;

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
      const [detail, auth, conversationHistory] = await Promise.all([
        getConversation(conversationId),
        getAuthContext(),
        getConversationHistory(),
      ]);
      setConversation(detail.conversation);
      setMessages(detail.messages);
      setModels(detail.models);
      setBalance(detail.wallet?.balance ?? 0);
      setGuest(auth.actor.kind === "guest");
      setGuestQuota(detail.guest_quota ?? auth.guest_quota);
      setUser(auth.actor.kind === "member" ? auth.actor.user : null);
      setHistory(conversationHistory.items);
      setExperience(detail.experience);
      setChatStreamingEnabled(auth.capabilities.chat_streaming === true);
      setLiked(null);
      setFavorited(null);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        router.replace("/");
        return;
      }
      setError("聊天暂时加载失败，请返回后重试。");
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
  useEffect(() => {
    // Overlays and their triggers opt out by marker, so a click on either is
    // handled by its own onClick instead of being swallowed here.
    function onPointerDown(event: globalThis.PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-overlay], [data-overlay-trigger]")) return;
      closeOverlays();
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") closeOverlays();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  useEffect(() => () => {
    abortRef.current?.abort();
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    reconciliationTimersRef.current.forEach((timer) => clearTimeout(timer));
    [toastTimerRef.current, memoryPulseTimerRef.current, memoryFlightTimerRef.current, longPressRef.current.timer].forEach((timer) => {
      if (timer !== null) clearTimeout(timer);
    });
    document.querySelectorAll(".memory-particle, .memory-trail").forEach((node) => node.remove());
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
            .then((detail) => { setBalance(detail.wallet?.balance ?? 0); setGuestQuota(detail.guest_quota ?? null); })
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
      setError("模型切换失败，请重试。");
    } finally {
      setSwitchingModel(false);
    }
  }

  // Guests may open the model list and tap any model; the reveal that it needs an
  // account is deferred to this point — we remember the choice and open sign-in,
  // then apply it in the sign-in success handler so the login pays off immediately.
  function chooseModel(profile: ModelProfile["profile"]) {
    setComposerPanel(null);
    setMobileSheet(null);
    if (guest) {
      setPendingModel(profile);
      setSignInOpen(true);
      return;
    }
    void selectModel(profile);
  }

  /**
   * Shared turn runner. A `continue` turn adds no user bubble — the backend does
   * not persist an inbound message for it — so the only difference is which rows
   * go into the optimistic update.
   */
  async function runTurn(kind: "message" | "continue", content: string) {
    if (!conversation) return;
    const requestId = crypto.randomUUID();
    const assistantId = `local-assistant:${requestId}`;
    const controller = new AbortController();
    let accepted = false;
    setMessages((current) => [
      ...current,
      ...(kind === "message"
        ? [{ id: requestId, message_id: requestId, role: "user", content, status: "sending" } as ChatMessage]
        : []),
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
          guest,
          kind,
          signal: controller.signal,
          onEvent: (streamEvent) => {
            if (activeTurnRef.current?.requestId !== requestId || activeTurnRef.current.cancelled) return;
            if (streamEvent.type === "turn.accepted") {
              accepted = true;
              setGenerationState("streaming");
              setMessages((current) => current.map((item) => item.id === requestId
                ? { ...item, status: "completed" }
                : item.id === assistantId ? { ...item, status: "streaming" } : item));
              if (streamEvent.guest_quota) setGuestQuota(streamEvent.guest_quota);
            } else if (streamEvent.type === "message.delta") {
              setGenerationState("streaming");
              appendAssistantDelta(assistantId, streamEvent.text);
            } else if (streamEvent.type === "turn.completed") {
              flushAssistantBuffer(assistantId);
              setBalance(streamEvent.wallet?.balance ?? 0);
              if (streamEvent.guest_quota) setGuestQuota(streamEvent.guest_quota);
              setMessages((current) => current.map((item) => item.id === assistantId ? {
                ...item,
                id: streamEvent.message_id ?? item.id,
                message_id: streamEvent.message_id,
                status: "completed",
              } : item));
            } else if (streamEvent.type === "turn.cancelled") {
              flushAssistantBuffer(assistantId);
              setBalance(streamEvent.wallet?.balance ?? 0);
              if (streamEvent.guest_quota) setGuestQuota(streamEvent.guest_quota);
              setMessages((current) => current.map((item) => item.id === assistantId ? {
                ...item,
                id: streamEvent.message_id ?? item.id,
                message_id: streamEvent.message_id,
                status: "cancelled",
              } : item));
            } else if (streamEvent.type === "turn.failed") {
              flushAssistantBuffer(assistantId);
              setBalance(streamEvent.wallet?.balance ?? 0);
              if (streamEvent.guest_quota) setGuestQuota(streamEvent.guest_quota);
              setMessages((current) => current.map((item) => item.id === assistantId
                ? { ...item, status: "failed" }
                : item.id === requestId ? { ...item, status: accepted ? "completed" : "failed" } : item));
              setText((current) => current || content);
              setError("回复生成失败，请重试。");
            }
          },
        });
      } else {
        const result = await sendTurn(conversation.id, content, requestId, guest, kind);
        setMessages((current) => current.map((item) => item.id === requestId
          ? { ...item, status: "completed" }
          : item.id === assistantId ? {
            ...item,
            id: result.reply.message_id ?? item.id,
            message_id: result.reply.message_id,
            content: result.reply.text,
            status: "completed",
          } : item));
        setBalance(result.wallet?.balance ?? 0);
        if (result.guest_quota) setGuestQuota(result.guest_quota);
      }
    } catch (sendError) {
      if (controller.signal.aborted) return;
      flushAssistantBuffer(assistantId);
      setMessages((current) => current.map((item) => item.id === assistantId
        ? { ...item, status: "failed" }
        : item.id === requestId ? { ...item, status: accepted ? "completed" : "failed" } : item));
      if (sendError instanceof ApiError && sendError.message === "guest_sign_in_required") {
        setSignInOpen(true);
        setError("免费体验次数已用完，登录后可继续并保存故事进度。");
        return;
      }
      if (redirectIfUnauthorized(sendError)) return;
      setError(sendError instanceof Error && sendError.message === "insufficient_coins" ? "金币余额不足。" : "消息或回复中断，请再试一次。");
      setText((current) => current || content);
    } finally {
      if (activeTurnRef.current?.requestId === requestId) activeTurnRef.current = null;
      if (abortRef.current === controller) abortRef.current = null;
      setGenerationState("idle");
      focusVisibleComposer();
    }
  }

  /** Shared gate for both turn kinds: session, busy state and coin balance. */
  function turnBlocked() {
    if (!conversation || sending || switchingModel || (!guest && !selectedModel)) return true;
    if (!guest && selectedModel && balance < selectedModel.coin_cost) {
      setError("金币余额不足，暂时无法发送这条消息。");
      return true;
    }
    return false;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = text.trim();
    if (!content || turnBlocked()) return;
    setText("");
    setError(null);
    await runTurn("message", content);
  }

  async function continueTurn() {
    if (turnBlocked()) return;
    setError(null);
    await runTurn("continue", "");
  }

  async function confirmRestart() {
    if (!conversation || guest || sending || switchingModel) return;
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
      setError("重新开始失败，请稍后再试。");
    } finally {
      setRestarting(false);
    }
  }

  async function signOut() {
    try { await logout(); } catch { /* an expired session is already signed out */ }
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
  // "Continue" only makes sense on a finished reply the reader is currently
  // looking at, so it hides while scrolled away from the latest message.
  const lastMessage = messages[messages.length - 1];
  const lastMessageStatus = lastMessage ? getMessageStatus(lastMessage) : null;
  const canContinue = !sending && !switchingModel && !showScrollLatest
    && lastMessage?.role === "assistant"
    && Boolean(lastMessage.content)
    && (lastMessageStatus === "completed" || lastMessageStatus === "cancelled");
  const memories = conversationTools.pins;
  // Memories written by hand sit above the ones saved from a reply: those are the
  // ones the user curates, so they must not sink under whatever was long-pressed.
  // Exactly one memory is written by hand. It is pinned to the top of the list and
  // is the only row that can be edited; writing again rewrites it instead of
  // adding a second one.
  const manualMemory = memories.find((pin) => !pin.message_id) ?? null;
  const savedMemories = memories
    .filter((pin) => Boolean(pin.message_id))
    .sort((left, right) => {
      const leftTime = left.created_at ? Date.parse(left.created_at) : Number.NaN;
      const rightTime = right.created_at ? Date.parse(right.created_at) : Number.NaN;
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return rightTime - leftTime;
      return right.sort_order - left.sort_order;
    });
  const savedMemoryKeys = new Set(memories.map((pin) => pin.message_id).filter((id): id is string => Boolean(id)));
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
    if (guest) { setSignInOpen(true); return; }
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
      setError("点赞状态保存失败，请重试。");
    } finally {
      setReactionBusy(false);
    }
  }

  async function toggleFavorite() {
    if (guest) { setSignInOpen(true); return; }
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
      setError("收藏状态保存失败，请重试。");
    } finally {
      setReactionBusy(false);
    }
  }

  function messageMemoryKey(message: ChatMessage) {
    return String(message.message_id ?? message.id);
  }

  function showToast(text: string, tone: "ok" | "info" | "error" = "ok") {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    uidRef.current += 1;
    setToast({ id: uidRef.current, text, tone });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }

  // The flight orb and the icon pulse are decoration, so they are driven straight
  // through the DOM: routing them through React state re-rendered the whole chat
  // tree (both message lists) on the very frame the animation started.
  function pulseMemoryIcon() {
    const icons = [desktopMemoryIconRef.current, mobileMemoryIconRef.current];
    icons.forEach((icon) => {
      if (!icon) return;
      icon.classList.remove("is-pulsing");
      void icon.offsetWidth; // restart the ring even on back-to-back saves
      icon.classList.add("is-pulsing");
    });
    if (memoryPulseTimerRef.current !== null) window.clearTimeout(memoryPulseTimerRef.current);
    memoryPulseTimerRef.current = window.setTimeout(() => {
      icons.forEach((icon) => icon?.classList.remove("is-pulsing"));
    }, 900);
  }

  // Fly a small orb from the saved bubble to the memory icon in the top bar so the
  // user can see where the memory landed. Falls back to just pulsing the icon when
  // the source or target is not on screen (e.g. the other layout's copy of the bar).
  function flyToMemoryIcon(source: HTMLElement | null, surface: "desktop" | "mobile") {
    const target = (surface === "mobile" ? mobileMemoryIconRef : desktopMemoryIconRef).current;
    if (!source || !target) {
      pulseMemoryIcon();
      return;
    }
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const x = from.left + from.width / 2;
    const y = from.top + from.height / 2;
    const dx = to.left + to.width / 2 - x;
    const dy = to.top + to.height / 2 - y;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      pulseMemoryIcon();
      return;
    }

    // Bow the path away from the straight line, always toward the top of the
    // screen, so the trail reads as an arc rather than a diagonal streak.
    const length = Math.hypot(dx, dy) || 1;
    const bow = Math.min(length * 0.34, 150);
    let controlX = dx / 2 + (-dy / length) * bow;
    let controlY = dy / 2 + (dx / length) * bow;
    if (controlY > dy / 2) {
      controlX = dx / 2 - (-dy / length) * bow;
      controlY = dy / 2 - (dx / length) * bow;
    }

    // The arc itself, drawn head-first along the same curve the particles take.
    // The stroke gradient runs transparent at the source → solid at the icon, so
    // the tail dissolves behind the leading edge.
    const trail = document.createElementNS(SVG_NS, "svg");
    trail.setAttribute("class", "memory-trail");
    trail.setAttribute("aria-hidden", "true");
    uidRef.current += 1;
    const gradientId = `memory-trail-${uidRef.current}`;
    const defs = document.createElementNS(SVG_NS, "defs");
    const gradient = document.createElementNS(SVG_NS, "linearGradient");
    gradient.setAttribute("id", gradientId);
    gradient.setAttribute("gradientUnits", "userSpaceOnUse");
    gradient.setAttribute("x1", `${x}`);
    gradient.setAttribute("y1", `${y}`);
    gradient.setAttribute("x2", `${x + dx}`);
    gradient.setAttribute("y2", `${y + dy}`);
    ([["0%", "rgba(255,255,255,0)"], ["55%", "rgba(255,255,255,.07)"], ["100%", "rgba(255,255,255,.32)"]] as const)
      .forEach(([offset, color]) => {
        const stop = document.createElementNS(SVG_NS, "stop");
        stop.setAttribute("offset", offset);
        stop.setAttribute("stop-color", color);
        gradient.appendChild(stop);
      });
    defs.appendChild(gradient);
    trail.appendChild(defs);
    const arc = document.createElementNS(SVG_NS, "path");
    arc.setAttribute("d", `M ${x} ${y} Q ${x + controlX} ${y + controlY} ${x + dx} ${y + dy}`);
    arc.setAttribute("fill", "none");
    arc.setAttribute("stroke", `url(#${gradientId})`);
    arc.setAttribute("stroke-width", "1");
    arc.setAttribute("stroke-linecap", "round");
    trail.appendChild(arc);
    document.body.appendChild(trail);
    const arcLength = arc.getTotalLength();
    arc.style.strokeDasharray = `${arcLength}`;
    // Dim as it completes, so the line never sits at full strength on screen.
    arc.animate([
      { strokeDashoffset: arcLength, opacity: 0.75 },
      { strokeDashoffset: 0, opacity: 0.45, offset: 0.66 },
      { strokeDashoffset: 0, opacity: 0 },
    ], { duration: MEMORY_FLIGHT_MS + 320, easing: "cubic-bezier(.35,.02,.2,1)", fill: "forwards" });

    // Mostly four-point sparkles with a few small motes mixed in for texture.
    const particles: { node: HTMLSpanElement; sparkle: boolean; baseScale: number; spin: number; phase: number }[] = [];
    const batch = document.createDocumentFragment();
    for (let index = 0; index < MEMORY_PARTICLES; index += 1) {
      const node = document.createElement("span");
      const sparkle = index % 3 !== 2;
      node.className = `memory-particle ${sparkle ? "is-sparkle" : "is-mote"}`;
      node.setAttribute("aria-hidden", "true");
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      // Lead particles are the lightest, so the trail itself reads as a gradient.
      node.style.background = MEMORY_PARTICLE_TINTS[index % MEMORY_PARTICLE_TINTS.length];
      particles.push({
        node,
        sparkle,
        baseScale: sparkle ? 0.34 + Math.random() * 0.42 : 0.62 + Math.random() * 0.5,
        spin: (Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * 180),
        phase: Math.random() * Math.PI * 2,
      });
      batch.appendChild(node);
    }
    document.body.appendChild(batch);

    let pending = particles.length;
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      particles.forEach((particle) => particle.node.remove());
      trail.remove();
      pulseMemoryIcon();
    };
    const particleDone = () => {
      pending -= 1;
      if (pending <= 0) land();
    };

    particles.forEach((particle, index) => {
      // Scatter the start a little; the offset decays to zero so every particle
      // still converges exactly on the icon.
      const spreadX = (Math.random() - 0.5) * 34;
      const spreadY = (Math.random() - 0.5) * 34;
      const wobble = (Math.random() - 0.5) * 0.5;
      const frames: Keyframe[] = [];
      for (let step = 0; step <= MEMORY_ARC_SAMPLES; step += 1) {
        const t = step / MEMORY_ARC_SAMPLES;
        const u = 1 - t;
        const px = 2 * u * t * controlX * (1 + wobble * u) + t * t * dx + spreadX * u;
        const py = 2 * u * t * controlY * (1 + wobble * u) + t * t * dy + spreadY * u;
        const envelope = t < 0.22 ? 0.35 + (t / 0.22) * 0.75 : 1.1 - ((t - 0.22) / 0.78) * 0.95;
        // Sparkles twinkle on the way up; motes just travel.
        const twinkle = particle.sparkle ? 0.76 + 0.24 * Math.sin(t * Math.PI * 3 + particle.phase) : 1;
        const scale = particle.baseScale * envelope * twinkle;
        const opacity = t < 0.12 ? t / 0.12 : t > 0.82 ? (1 - t) / 0.18 : 1;
        frames.push({
          offset: t,
          transform: `translate(${px}px, ${py}px) rotate(${particle.spin * t}deg) scale(${scale})`,
          opacity,
        });
      }
      const flight = particle.node.animate(frames, {
        duration: MEMORY_FLIGHT_MS + Math.random() * 260,
        delay: index * 40 + Math.random() * 60,
        easing: "cubic-bezier(.35,.02,.2,1)",
        fill: "backwards",
      });
      flight.finished.then(particleDone, particleDone);
    });

    // Safety net in case the animations are discarded before they ever finish.
    if (memoryFlightTimerRef.current !== null) window.clearTimeout(memoryFlightTimerRef.current);
    memoryFlightTimerRef.current = window.setTimeout(land, MEMORY_FLIGHT_MS + 1400);
  }

  function addMemory(pin: ConversationPin) {
    setExperience((current) => current ? {
      ...current,
      conversation_tools: { ...current.conversation_tools, pins: [...current.conversation_tools.pins, pin] },
    } : current);
  }

  async function copyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      showToast("Copied", "info");
    } catch {
      showToast("Copy failed", "error");
    }
  }

  async function saveMemory(message: ChatMessage, source: HTMLElement | null, surface: "desktop" | "mobile") {
    if (guest) { setSignInOpen(true); return; }
    const content = message.content.trim();
    if (!conversation || !content || memoryBusyRef.current) return;
    const key = messageMemoryKey(message);
    if (savedMemoryKeys.has(key)) {
      flyToMemoryIcon(source, surface);
      showToast("Memory already saved", "info");
      return;
    }
    // Start the orb before any state change so it is already running on the
    // compositor by the time React commits.
    flyToMemoryIcon(source, surface);
    memoryBusyRef.current = true;
    try {
      const result = await createConversationPin(conversation.id, { content, message_id: key });
      addMemory(result.pin);
      showToast("Memory saved");
    } catch (memoryError) {
      if (redirectIfUnauthorized(memoryError)) return;
      // The pins endpoint is still on the backend roadmap (TECH-06 §7.4). Until it
      // ships, keep the memory for this session so the panel matches what the user
      // just did; the server copy takes over once the endpoint exists.
      if (memoryError instanceof ApiError && [404, 405, 501].includes(memoryError.status)) {
        addMemory({ id: `local:${key}`, content, sort_order: memories.length, message_id: key });
        showToast("Memory saved");
        return;
      }
      showToast("Couldn't save this memory", "error");
    } finally {
      memoryBusyRef.current = false;
    }
  }

  // The saved list fades its bottom edge to show there is more below. Toggled on the
  // node instead of through state: every state change here re-renders both message
  // lists, which is not worth paying for one class.
  function markMemoryListEnd(node: HTMLDivElement | null) {
    if (!node) return;
    node.classList.toggle("is-end", node.scrollHeight - node.scrollTop - node.clientHeight <= 2);
  }

  function memorySavedAt(pin: ConversationPin) {
    if (!pin.created_at) return "Saved from an AI reply";
    const savedAt = new Date(pin.created_at);
    if (Number.isNaN(savedAt.getTime())) return "Saved from an AI reply";
    return `Saved ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(savedAt)}`;
  }

  function openMemoryComposer(surface: "desktop" | "mobile", pin?: ConversationPin) {
    if (guest) { setSignInOpen(true); return; }
    setMemoryEditing(pin ?? null);
    setMemoryDraft(pin ? pin.content : "");
    setMemoryPanelOpen(false);
    setMobileSheet(null);
    setMemoryComposer(surface);
  }

  function closeMemoryComposer() {
    setMemoryComposer(null);
    setMemoryDraft("");
    setMemoryEditing(null);
  }

  function finishManualMemory(editing: boolean) {
    closeMemoryComposer();
    pulseMemoryIcon();
    showToast(editing ? "Memory updated" : "Memory saved");
  }

  function replaceMemory(pin: ConversationPin) {
    setExperience((current) => current ? {
      ...current,
      conversation_tools: {
        ...current.conversation_tools,
        pins: current.conversation_tools.pins.map((item) => item.id === pin.id ? pin : item),
      },
    } : current);
  }

  async function saveManualMemory() {
    const content = memoryDraft.trim();
    if (!conversation || !content || memorySaving) return;
    const editing = memoryEditing;
    if (editing && editing.content === content) { closeMemoryComposer(); return; }
    setMemorySaving(true);
    try {
      if (editing) {
        const result = await updateConversationPin(conversation.id, editing.id, { content });
        replaceMemory(result.pin);
      } else {
        // No message_id: this memory did not come from a bubble, so nothing should
        // mark a reply as already saved because of it.
        const result = await createConversationPin(conversation.id, { content, message_id: null });
        addMemory(result.pin);
      }
      finishManualMemory(Boolean(editing));
    } catch (memoryError) {
      if (redirectIfUnauthorized(memoryError)) return;
      // Same fallback as saveMemory: keep it for this session until the pins
      // endpoint ships, so the panel matches what the user just wrote. A pin that
      // only exists locally can never be updated on the server either.
      const offline = memoryError instanceof ApiError && [404, 405, 501].includes(memoryError.status);
      if (offline && editing) {
        replaceMemory({ ...editing, content });
        finishManualMemory(true);
        return;
      }
      if (offline) {
        uidRef.current += 1;
        addMemory({ id: `local:manual:${uidRef.current}`, content, sort_order: memories.length, message_id: null });
        finishManualMemory(false);
        return;
      }
      showToast(editing ? "Couldn't update this memory" : "Couldn't save this memory", "error");
    } finally {
      setMemorySaving(false);
    }
  }

  function onMemoryDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") { event.preventDefault(); closeMemoryComposer(); return; }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void saveManualMemory(); }
  }

  function cancelLongPress() {
    if (longPressRef.current.timer !== null) {
      window.clearTimeout(longPressRef.current.timer);
      longPressRef.current.timer = null;
    }
  }

  // Mobile has no hover, so the message actions live behind a long press on the
  // character's bubble, matching the platform-native context-menu gesture.
  function beginLongPress(event: React.TouchEvent<HTMLDivElement>, message: ChatMessage) {
    const touch = event.touches[0];
    if (!touch) return;
    const anchor = event.currentTarget;
    cancelLongPress();
    longPressRef.current.x = touch.clientX;
    longPressRef.current.y = touch.clientY;
    longPressRef.current.timer = window.setTimeout(() => {
      longPressRef.current.timer = null;
      if (typeof navigator.vibrate === "function") navigator.vibrate(12);
      setMessageMenu({
        message,
        x: Math.min(Math.max(touch.clientX - 24, 10), window.innerWidth - 178),
        y: Math.min(touch.clientY + 10, window.innerHeight - 126),
        anchor,
      });
    }, 460);
  }

  function moveLongPress(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    const moved = Math.abs(touch.clientX - longPressRef.current.x) > 8 || Math.abs(touch.clientY - longPressRef.current.y) > 8;
    if (moved) cancelLongPress();
  }

  return (
    <main className="reference-chat-shell" style={{ "--accent": character.accent_color } as React.CSSProperties}>
      <Image className="chat-world-bg" src={cover} alt="" fill priority sizes="(min-width: 768px) 100vw, 1px" />
      <div className="chat-world-overlay" />

      <section className={`mobile-chat-shell${mobileCharacterBackground ? " has-character-background" : ""}`} aria-label={`${displayName} 移动端对话`}>
        {mobileCharacterBackground && <Image className="mobile-chat-background" src={cover} alt="" fill priority sizes="(max-width: 767px) 100vw, 1px" />}
        <div className="mobile-chat-shade" />

        <header className="mobile-chat-header">
          <button className="mobile-round-button" onClick={() => router.push("/")} aria-label="返回角色列表"><BackIcon /></button>
          <button className="mobile-character-button" onClick={() => setShowMobileProfile(true)} aria-label="查看角色资料">
            <span><Image src={cover} alt="" fill sizes="34px" /></span>
            <b>{displayName}</b>
            {primaryBadge && <i title={primaryBadge.display_name}>✦</i>}
          </button>
          <button
            ref={mobileMemoryIconRef}
            className="mobile-round-button mobile-memory-button"
            onClick={() => setMobileSheet("pinned")}
            aria-label="查看本次对话的记忆"
          ><MemoryIcon />{memories.length > 0 && <i>{memories.length}</i>}</button>
          <button className="mobile-round-button mobile-header-more" onClick={() => setMobileSheet("more")} aria-label="更多设置"><MoreIcon /></button>
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

            {messages.map((message) => {
              const status = getMessageStatus(message);
              const waiting = !message.content && (status === "sending" || status === "streaming");
              const memoryKey = messageMemoryKey(message);
              const saved = savedMemoryKeys.has(memoryKey);
              const canSave = message.role === "assistant" && !waiting && status !== "failed" && Boolean(message.content);
              const pressed = messageMenu?.message.id === message.id;
              return (
              <div className={`mobile-message-row ${message.role}${status === "failed" ? " failed" : status === "cancelled" ? " cancelled" : ""}`} key={`mobile-${message.id}`}>
                {message.role === "assistant" && <span className="mobile-message-avatar"><Image src={cover} alt="" fill sizes="28px" /></span>}
                <div className="mobile-message-stack">
                  {message.role === "assistant" && <b className="message-author">{displayName}</b>}
                  {waiting
                    ? <div className="typing"><i /><i /><i /></div>
                    : <div
                        className={`mobile-bubble${pressed ? " is-pressed" : ""}${canSave ? " is-pressable" : ""}`}
                        onTouchStart={canSave ? (event) => beginLongPress(event, message) : undefined}
                        onTouchMove={canSave ? moveLongPress : undefined}
                        onTouchEnd={canSave ? cancelLongPress : undefined}
                        onTouchCancel={canSave ? cancelLongPress : undefined}
                        onContextMenu={canSave ? (event) => event.preventDefault() : undefined}
                      >{message.content || (status === "cancelled" ? "Response stopped" : "Response failed")}</div>}
                  <small>{messageStatusText(message)}</small>
                </div>
              </div>
            );})}
          </div>
          {canContinue && <button className="mobile-continue-turn" onClick={() => void continueTurn()} aria-label="让角色继续这段回复"><ContinueIcon /></button>}
          {showScrollLatest && <button className="mobile-scroll-latest" onClick={scrollToLatest} aria-label="回到最新消息"><ScrollLatestIcon /></button>}
        </section>

        <section className="mobile-composer-panel">
          {error && <div className="mobile-composer-error">{error}<button onClick={() => setError(null)}>×</button></div>}
          <div className="mobile-tool-row">
            <button className="mobile-card-pill" onClick={() => setMobileSheet("model")} aria-label="切换模型"><RoleIcon /><span className="mobile-card-pill-label">{modelName(selectedModel) ?? "Model"}</span></button>
            <button className="mobile-card-pill" onClick={() => setMobileSheet("pinned")} aria-label="查看本次对话的记忆"><CommentIcon /><span className="mobile-card-pill-label">Memory{memories.length > 0 ? ` · ${memories.length}` : ""}</span></button>
          </div>
          <form className="mobile-composer" onSubmit={submit}>
            <button type="button" className="mobile-inspire-btn" aria-label="生成灵感提示" onClick={useInspiration}><InspirationIcon /></button>
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
              aria-label={canStopGeneration ? "停止生成" : "发送消息"}
            >{canStopGeneration ? <StopIcon /> : <SendIcon />}</button>
          </form>
        </section>

        {showMobileProfile && (
          <div className="mobile-sheet-backdrop" onClick={() => setShowMobileProfile(false)}>
            <aside className="mobile-profile-sheet" onClick={(event) => event.stopPropagation()} aria-label={`${displayName} 角色资料`}>
              <div className="mobile-sheet-handle" />
              <header className="mobile-profile-actions">
                <button className="mobile-cid">CID: {character.id.replace("char_", "").slice(0, 5)}… <span>▣</span></button>
                <button onClick={() => void shareCharacter()} aria-label="分享角色"><ShareIcon /></button>
                <button onClick={() => setShowMobileProfile(false)} aria-label="关闭角色资料"><CloseIcon /></button>
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
              <header><b>{mobileSheet === "model" ? "Story model" : mobileSheet === "role" ? "Role Card" : mobileSheet === "pinned" ? "Memory" : "Chat settings"}</b><div className="mobile-sheet-actions">{mobileSheet === "pinned" && <button onClick={() => openMemoryComposer("mobile", manualMemory ?? undefined)} aria-label={manualMemory ? "编辑手写记忆" : "手动写一条记忆"}>{manualMemory ? <EditIcon /> : <PlusIcon />}</button>}<button onClick={() => setMobileSheet(null)}><CloseIcon /></button></div></header>
              {mobileSheet === "model" && <div className="mobile-model-list">{(guest ? GUEST_MODEL_TEASER : models).map((model) => (
                <button key={model.profile} className={!guest && model.profile === conversation.model_profile ? "selected" : ""} disabled={sending || switchingModel} onClick={() => chooseModel(model.profile)}><span><b>{modelName(model)}</b><small>{guest ? "Sign in to unlock" : `${model.coin_cost} coins / message`}</small></span><i>{!guest && model.profile === conversation.model_profile ? "✓" : ""}</i></button>
              ))}</div>}
              {mobileSheet === "role" && <div className="mobile-sheet-copy">{conversationTools.role_card ? <><span className="test-user-avatar">{conversationTools.role_card.display_name.slice(0, 1).toUpperCase()}</span><div><b>{conversationTools.role_card.display_name}</b><p>{conversationTools.role_card.description}</p></div></> : <p>No role card selected</p>}</div>}
              {mobileSheet === "pinned" && <div className="memory-v1 mobile-memory-v1">
                <p className="memory-lede">These memories become long-term facts that shape {displayName}&apos;s future replies.</p>
                <section className="permanent-memory-card">
                  <div className="permanent-memory-heading"><div><span>Permanent Memory</span><small>{manualMemory ? "1 / 1 used" : "0 / 1 used"}</small></div>{manualMemory && <button className="permanent-memory-edit" onClick={() => openMemoryComposer("mobile", manualMemory)}><EditIcon />Edit</button>}</div>
                  {manualMemory
                    ? <div className="permanent-memory-content"><p>{manualMemory.content}</p><small>You wrote this · Always active · {manualMemory.content.length} / {MEMORY_DRAFT_MAX}</small></div>
                    : <button className="permanent-memory-empty" onClick={() => openMemoryComposer("mobile")}><PlusIcon /><span><b>Add your permanent memory</b><small>Preferences, boundaries, relationship details, and more</small></span></button>}
                </section>
                <section className="saved-memories-section">
                  <div className="memory-section-heading"><div><span>Saved Memories</span><em>{savedMemories.length}</em></div><small>Long-press an AI reply to save it. Newest first.</small></div>
                  {savedMemories.length === 0
                    ? <p className="saved-memories-empty"><NoteIcon />Long-press an AI reply to save it here.</p>
                    : <div className="memory-list" ref={markMemoryListEnd} onScroll={(event) => markMemoryListEnd(event.currentTarget)}>{savedMemories.map((pin) => <div className="memory-entry" key={pin.id}><small>{memorySavedAt(pin)}</small><p>{pin.content}</p></div>)}</div>}
                </section>
              </div>}
              {mobileSheet === "more" && <div className="mobile-sheet-menu"><button className="mobile-background-setting" aria-pressed={mobileCharacterBackground} onClick={() => setMobileCharacterBackground((enabled) => !enabled)}><RoleIcon /><span><b>Character chat background</b><small>Show character artwork behind messages</small></span><i className={mobileCharacterBackground ? "on" : ""}><em /></i></button><button onClick={() => { setMobileSheet(null); setShowMobileProfile(true); }}><RoleIcon /><span><b>Character profile</b><small>View story details and memories</small></span></button><button onClick={() => { setMobileSheet(null); void shareCharacter(); }}><ShareIcon /><span><b>Share character</b><small>Copy a link to this character</small></span></button><button onClick={() => { setMobileSheet(null); setShowRestart(true); }}><RestartIcon /><span><b>Restart story</b><small>Archive this chat and begin again</small></span></button></div>}
            </section>
          </div>
        )}
      </section>

      <header className="site-header chat-site-header">
        <div className="header-brand-group"><Brand /><CommunityLink /></div>
        <div className="site-header-actions">
          <button className="header-circle" aria-label="搜索" onClick={() => router.push("/?search=1")}><SearchIcon /></button>
          <button className="header-circle" aria-label="创作" title="创作" onClick={() => router.push("/create")}><CreateIcon /></button>
          <div className="header-menu-wrap"><button className="header-circle language-symbol" data-overlay-trigger aria-label="切换语言" aria-expanded={languageOpen} onClick={() => { const next = !languageOpen; closeOverlays(); setLanguageOpen(next); }}><TranslationIcon /></button>{languageOpen && <div className="header-dropdown language-menu" data-overlay><button className="selected">简体中文 <span>✓</span></button><button>English</button><small>More languages coming soon</small></div>}</div>
          {!guest && <div className="header-menu-wrap"><button className="coin-button" data-overlay-trigger onClick={() => { const next = !walletOpen; closeOverlays(); setWalletOpen(next); }} aria-label={`金币余额 ${balance}`}><span>✦</span><strong>{balance.toLocaleString("zh-CN")}</strong></button>{walletOpen && <div className="header-dropdown wallet-panel" data-overlay><small>Coin balance</small><strong>{balance.toLocaleString("en-US")}</strong><h3>Transaction history</h3><p>No transactions yet</p><button disabled>Top-up · coming soon</button></div>}</div>}
          {guest && <button className="guest-header-login" onClick={() => setSignInOpen(true)}>登录</button>}
          {user && <div className="header-menu-wrap"><button className="account-button" data-overlay-trigger onClick={() => { const next = !accountOpen; closeOverlays(); setAccountOpen(next); }} aria-label="用户设置"><i>{user.display_name.slice(0, 1).toUpperCase()}</i><span>{user.display_name}</span><b>⌄</b></button>{accountOpen && <div className="header-dropdown account-menu" data-overlay><button disabled>Account settings · coming soon</button><button onClick={() => void signOut()}>Sign out</button></div>}</div>}
        </div>
      </header>

      {user && history.length > 0 && <aside ref={historyRailRef} className={`chat-history-rail${historyOpen ? " open" : ""}`} aria-label="Collections">
        <button className="history-toggle" onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen} aria-label={historyOpen ? "Collapse Collections" : "Open Collections"} title="Collections"><CollectionsIcon /></button>
        <div className="history-list">{history.map((item) => {
          const active = item.id === conversation.id;
          const avatar = item.character.avatar_ref ?? item.character.cover_ref ?? "/characters/kai.svg";
          return <button className={`history-item${active ? " active" : ""}`} key={item.id} disabled={active || sending} onClick={() => router.push(`/chat/${item.character_id}?conversation=${item.id}`)} aria-label={`打开与 ${item.character.display_name} 的聊天`}>
            <span className="history-avatar"><Image src={avatar} alt="" fill sizes="42px" /></span>
            <span className="history-copy"><strong>{item.character.display_name}</strong><small>{item.character.tagline}</small></span>
          </button>;
        })}</div>
      </aside>}

      <div className={`reference-chat-workspace${showProfile ? "" : " profile-collapsed"}`}>
        {showProfile && (
          <aside ref={roleProfileRef} className="role-profile" aria-label={`${displayName} 角色资料`}>
            <Image className="role-profile-cover" src={cover} alt={`${displayName} profile`} fill priority sizes="350px" />
            <div className="profile-image-shade" />
            <div className="profile-top-actions">
              <button className="profile-icon-action" aria-label="分享角色" title="分享角色" onClick={() => void shareCharacter()}><ShareIcon /></button>
              <button className="profile-icon-action" aria-label="收起角色资料" title="收起角色资料" onClick={() => setShowProfile(false)}><CollapseProfileIcon /></button>
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
              <button className="conversation-avatar" onClick={() => setShowProfile(true)} aria-label="显示角色资料"><Image src={cover} alt={displayName} fill sizes="48px" /></button>
              <span className="conversation-character-name" style={{ color: "#FFFFFF", fontWeight: "bold", fontSize: "20px" }}>{displayName}</span>
            </div>
            <div className="conversation-toolbar-actions">
              <button
                ref={desktopMemoryIconRef}
                className="more-pill memory-pill has-tooltip"
                data-overlay-trigger
                data-tooltip={memories.length > 0 ? `Memory · ${memories.length} saved` : "Memory"}
                aria-expanded={memoryPanelOpen}
                onClick={() => { const next = !memoryPanelOpen; closeOverlays(); setMemoryPanelOpen(next); }}
                aria-label="查看本次对话的记忆"
              ><MemoryIcon />{memories.length > 0 && <i>{memories.length}</i>}</button>
              <button className="more-pill has-tooltip" data-overlay-trigger data-tooltip="Layout & settings" onClick={() => { const next = !showChatMenu; closeOverlays(); setShowChatMenu(next); }} aria-label="对话布局与设置"><MoreIcon /></button>
            </div>
            {memoryPanelOpen && (
              <div className="memory-popover" data-overlay>
                <header><b>Memory</b><button onClick={() => setMemoryPanelOpen(false)} aria-label="关闭记忆面板">×</button></header>
                <div className="memory-v1">
                  <p className="memory-lede">These memories become long-term facts that shape {displayName}&apos;s future replies.</p>
                  <section className="permanent-memory-card">
                    <div className="permanent-memory-heading"><div><span>Permanent Memory</span><small>{manualMemory ? "1 / 1 used" : "0 / 1 used"}</small></div>{manualMemory && <button className="permanent-memory-edit" onClick={() => openMemoryComposer("desktop", manualMemory)}><EditIcon />Edit</button>}</div>
                    {manualMemory
                      ? <div className="permanent-memory-content"><p>{manualMemory.content}</p><small>You wrote this · Always active · {manualMemory.content.length} / {MEMORY_DRAFT_MAX}</small></div>
                      : <button className="permanent-memory-empty" onClick={() => openMemoryComposer("desktop")}><PlusIcon /><span><b>Add your permanent memory</b><small>Preferences, boundaries, relationship details, and more</small></span></button>}
                  </section>
                  <section className="saved-memories-section">
                    <div className="memory-section-heading"><div><span>Saved Memories</span><em>{savedMemories.length}</em></div><small>Long-press an AI reply to save it. Newest first.</small></div>
                    {savedMemories.length === 0
                      ? <p className="saved-memories-empty"><NoteIcon />Long-press an AI reply to save it here.</p>
                      : <div className="memory-list" ref={markMemoryListEnd} onScroll={(event) => markMemoryListEnd(event.currentTarget)}>{savedMemories.map((pin) => <div className="memory-entry" key={pin.id}><small>{memorySavedAt(pin)}</small><p>{pin.content}</p></div>)}</div>}
                  </section>
                </div>
              </div>
            )}
            {showChatMenu && (
              <div className="chat-settings-popover" data-overlay>
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

              {messages.map((message) => {
                const status = getMessageStatus(message);
                const waiting = !message.content && (status === "sending" || status === "streaming");
                const memoryKey = messageMemoryKey(message);
                const saved = savedMemoryKeys.has(memoryKey);
                const canSave = message.role === "assistant" && !waiting && status !== "failed" && Boolean(message.content);
                return (
                <div className={`reference-message-row ${message.role}${status === "failed" ? " failed" : status === "cancelled" ? " cancelled" : ""}`} key={message.id}>
                  {message.role === "assistant" && <span className="reference-message-avatar"><Image src={cover} alt="" fill sizes="30px" /></span>}
                  <div className="reference-message-stack">
                    {message.role === "assistant" && <b className="message-author">{displayName}</b>}
                    {waiting
                      ? <div className="typing"><i /><i /><i /></div>
                      : <div className="reference-bubble">{message.content || (status === "cancelled" ? "Response stopped" : "Response failed")}</div>}
                    {canSave && (
                      <div className="message-actions">
                        <button
                          type="button"
                          className={`message-action has-tooltip${saved ? " is-saved" : ""}`}
                          data-tooltip={saved ? "Saved to memory" : "Save memory"}
                          aria-label={saved ? "已保存为记忆" : "保存为记忆"}
                          onClick={(event) => void saveMemory(message, event.currentTarget, "desktop")}
                        ><MemoryIcon /></button>
                        <button
                          type="button"
                          className="message-action has-tooltip"
                          data-tooltip="Copy"
                          aria-label="复制这条消息"
                          onClick={() => void copyMessage(message.content)}
                        ><CopyIcon /></button>
                      </div>
                    )}
                    <small>{messageStatusText(message)}</small>
                  </div>
                </div>
              );})}
            </div>
            {canContinue && <button className="continue-turn has-tooltip" data-tooltip="Continue" onClick={() => void continueTurn()} aria-label="让角色继续这段回复"><ContinueIcon /></button>}
            {showScrollLatest && <button className="scroll-latest has-tooltip" data-tooltip="Back to latest" onClick={scrollToLatest} aria-label="回到最新消息"><ScrollLatestIcon /></button>}
          </section>

          <section className="reference-composer-panel">
            {error && <div className="composer-error">{error}<button onClick={() => setError(null)}>×</button></div>}
            {composerPanel === "model" && (
              <div className="composer-popover model-popover" data-overlay>
                <header><b>Story model</b><small>{guest ? "Try any model — sign in to unlock" : "Choose the model for this conversation"}</small></header>
                {(guest ? GUEST_MODEL_TEASER : models).map((model) => (
                  <button
                    key={model.profile}
                    className={!guest && model.profile === conversation.model_profile ? "selected" : ""}
                    disabled={sending || switchingModel}
                    onClick={() => chooseModel(model.profile)}
                  >
                    <span><b>{modelName(model)}</b><small>{guest ? "Sign in to unlock" : `${model.coin_cost} coins / message`}</small></span>
                    <i>{!guest && model.profile === conversation.model_profile ? "✓" : ""}</i>
                  </button>
                ))}
              </div>
            )}
            {composerPanel === "role" && (
              <div className="composer-popover info-popover" data-overlay>
                <header><b>Role Card</b><button onClick={() => setComposerPanel(null)}>×</button></header>
                {conversationTools.role_card ? (
                  <><p><span className="test-user-avatar">{conversationTools.role_card.display_name.slice(0, 1).toUpperCase()}</span><strong>{conversationTools.role_card.display_name}</strong></p><small>{conversationTools.role_card.description} Using a default test identity for now; editable role cards coming soon.</small></>
                ) : <p className="empty-pin"><RoleIcon /><strong>No role card selected</strong></p>}
              </div>
            )}
            <div className="composer-tools">
              <button className="chat-card-pill has-tooltip" data-overlay-trigger data-tooltip={selectedModel ? `${modelName(selectedModel)} · ${selectedModel.coin_cost} coins` : "Select model"} onClick={() => { const next = composerPanel === "model" ? null : "model" as const; closeOverlays(); setComposerPanel(next); }} aria-label="选择对话模型"><RoleIcon /><span className="chat-card-pill-label">{modelName(selectedModel) ?? "Model"}</span></button>
            </div>
            <form className="reference-composer" onSubmit={submit}>
              <button type="button" className="inspiration-button has-tooltip" data-tooltip="Inspiration" aria-label="生成灵感提示" onClick={useInspiration}><InspirationIcon /></button>
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
                aria-label={canStopGeneration ? "停止生成" : "发送消息"}
              >{canStopGeneration ? <StopIcon /> : <SendIcon />}</button>
            </form>
          </section>
        </section>
      </div>

      <footer className="chat-reference-footer"><span>Supported Cards</span><a>Privacy Policy</a><a>Terms of Service</a><a>Community Guidelines</a><a>About Us</a><small>© 2026 PLUM</small></footer>

      {messageMenu && (
        <div className="message-menu-backdrop" onClick={() => setMessageMenu(null)} onTouchStart={() => setMessageMenu(null)}>
          <div className="message-menu" style={{ left: messageMenu.x, top: messageMenu.y }} onClick={(event) => event.stopPropagation()} onTouchStart={(event) => event.stopPropagation()}>
            <button onClick={() => { const target = messageMenu; setMessageMenu(null); void copyMessage(target.message.content); }}><CopyIcon />Copy</button>
            <button onClick={() => { const target = messageMenu; setMessageMenu(null); void saveMemory(target.message, target.anchor, "mobile"); }}>
              <MemoryIcon />{savedMemoryKeys.has(messageMemoryKey(messageMenu.message)) ? "Saved to memory" : "Save memory"}
            </button>
          </div>
        </div>
      )}

      {toast && <div key={toast.id} className={`memory-toast is-${toast.tone}`} role="status" aria-live="polite">{toast.text}</div>}

      {memoryComposer === "desktop" && (
        <div className="modal-backdrop" onClick={() => { if (!memoryDraft.trim()) closeMemoryComposer(); }}>
          <section className="memory-composer" onClick={(event) => event.stopPropagation()}>
            <header>
              <div className="memory-composer-title"><b>{memoryEditing ? "Edit Permanent Memory" : "Create Permanent Memory"}</b><small>Free · Always remembered by {displayName}</small></div>
              <div>
                <button className="memory-composer-done" disabled={!memoryDraft.trim() || memorySaving} onClick={() => void saveManualMemory()}>{memorySaving ? "Saving…" : "Done"}</button>
                <button className="memory-composer-close" onClick={closeMemoryComposer} aria-label="关闭"><CloseIcon /></button>
              </div>
            </header>
            <textarea
              ref={memoryDraftRef}
              value={memoryDraft}
              maxLength={MEMORY_DRAFT_MAX}
              placeholder={`What should ${displayName} always remember? Add your preferences, boundaries, important dates, relationship details, or anything else that matters…`}
              onChange={(event) => setMemoryDraft(event.target.value)}
              onKeyDown={onMemoryDraftKeyDown}
            />
            <footer>{memoryDraft.length}/{MEMORY_DRAFT_MAX} characters</footer>
          </section>
        </div>
      )}

      {memoryComposer === "mobile" && (
        <section className="memory-editor">
          <header>
            <button onClick={closeMemoryComposer} aria-label="返回"><BackIcon /></button>
            <b>{memoryEditing ? "Edit Permanent Memory" : "Permanent Memory"}</b>
            <button className="memory-editor-help" title={`Free · Always remembered by ${displayName}`} aria-label="记忆说明"><HelpIcon /></button>
          </header>
          <div className="memory-editor-field">
            <textarea
              ref={memoryDraftRef}
              value={memoryDraft}
              maxLength={MEMORY_DRAFT_MAX}
              placeholder={`What should ${displayName} always remember? Add preferences, boundaries, important dates, relationship details, or anything else that matters…`}
              onChange={(event) => setMemoryDraft(event.target.value)}
              onKeyDown={onMemoryDraftKeyDown}
            />
            <small>{memoryDraft.length} / {MEMORY_DRAFT_MAX}</small>
          </div>
          <p className="memory-editor-promise">Free · {displayName} will remember this in future conversations.</p>
          <button className="memory-editor-confirm" disabled={!memoryDraft.trim() || memorySaving} onClick={() => void saveManualMemory()}>{memorySaving ? "Saving…" : "Save to Permanent Memory"}</button>
        </section>
      )}

      {showRestart && (
        <div className="modal-backdrop" onClick={() => setShowRestart(false)}>
          <div className="restart-modal" onClick={(event) => event.stopPropagation()}>
            <span className="modal-icon">↺</span><h2>Restart this relationship?</h2>
            <p>The current chat will be archived and a new conversation will start from the character&apos;s greeting.</p>
            <div><button className="secondary" onClick={() => setShowRestart(false)}>Cancel</button><button className="danger" disabled={sending} onClick={() => void confirmRestart()}>Restart</button></div>
          </div>
        </div>
      )}
      {signInOpen && <EmailSignInDialog onAuthenticated={() => {
        setSignInOpen(false);
        const wanted = pendingModel;
        const convId = conversation?.id;
        setPendingModel(null);
        // Reward the sign-in immediately: switch to the model the guest just tapped
        // on the same (promoted) conversation, then reload so the member UI + kept
        // context render together. If the switch is unavailable, fall back silently.
        void (async () => {
          await refresh();
          if (wanted && convId) { try { await updateModel(convId, wanted); } catch { /* keep default model */ } }
          await load();
        })();
      }} onClose={() => { setPendingModel(null); setSignInOpen(false); }} />}
      {showWelcome && <WelcomeDialog onComplete={() => { setShowWelcome(false); void refresh(); }} onClose={() => setShowWelcome(false)} />}
    </main>
  );
}

export default function ChatPage() {
  return <PlumAuthProvider><ChatContent /></PlumAuthProvider>;
}
