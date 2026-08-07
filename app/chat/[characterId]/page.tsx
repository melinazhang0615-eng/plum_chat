"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Brand, CoinBadge } from "@/components/brand";
import { createConversation, getConversation, restartConversation, sendTurn, updateModel } from "@/lib/api";
import { buildMockCharacterExperience } from "@/lib/character-experience";
import { chatCoverByCharacter, formatCompactCount, getPresentation } from "@/lib/presentation";
import type { ChatMessage, Conversation, ModelProfile } from "@/lib/types";

function formatTime(value?: string) {
  if (!value) return "刚刚";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "+08:00";
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.3 4.3" /></svg>;
}
function GlobeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.2 2.4 3.3 5.4 3.3 9S14.2 18.6 12 21M12 3C9.8 5.4 8.7 8.4 8.7 12s1.1 6.6 3.3 9" /></svg>;
}
function SendIcon() {
  return <svg viewBox="0 0 30 30" aria-hidden="true"><path d="M25.54 5.17 3.79 13.57c-1.23.47-1.2 1.16.06 1.53l5.26 1.56 2.14 6.36c.28.84 1.01 1.01 1.63.39l2.76-2.73 5.44 3.99c.71.52 1.44.25 1.63-.62l3.97-17.89c.19-.86-.32-1.3-1.14-.99Zm-3.31 4.05-9.28 8.27c-.17.15-.32.44-.34.66l-.41 3.85c-.05.44-.19.46-.33.04l-1.8-5.41c-.07-.22.03-.48.22-.59l11.77-7.06c.75-.45.83-.34.17.24Z" /></svg>;
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

function ChatLoading() {
  return <main className="chat-loading"><div className="loading-mark"><i /><i /><i /></div><p>正在走进角色的世界…</p></main>;
}

export default function ChatPage() {
  const params = useParams<{ characterId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const desktopMessageStageRef = useRef<HTMLElement>(null);
  const mobileMessageStageRef = useRef<HTMLElement>(null);
  const desktopTextareaRef = useRef<HTMLTextAreaElement>(null);
  const mobileTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [models, setModels] = useState<ModelProfile[]>([]);
  const [balance, setBalance] = useState(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
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
  const [showMobileProfile, setShowMobileProfile] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<"model" | "role" | "pinned" | "more" | null>(null);

  const selectedModel = useMemo(
    () => models.find((item) => item.profile === conversation?.model_profile),
    [models, conversation?.model_profile],
  );
  const presentation = getPresentation(search.get("presentation"));

  async function load() {
    setLoading(true);
    setError(null);
    try {
      let conversationId = search.get("conversation");
      if (!conversationId) {
        const created = await createConversation(params.characterId);
        conversationId = created.conversation.id;
        const presentationQuery = search.get("presentation");
        router.replace(`/chat/${params.characterId}?conversation=${conversationId}${presentationQuery ? `&presentation=${presentationQuery}` : ""}`);
      }
      const detail = await getConversation(conversationId);
      setConversation(detail.conversation);
      setMessages(detail.messages);
      setModels(detail.models);
      setBalance(detail.wallet.balance);
      setLiked(null);
      setFavorited(null);
    } catch {
      setError("聊天暂时加载失败，请返回后重试。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [params.characterId]);
  useEffect(() => {
    [desktopMessageStageRef.current, mobileMessageStageRef.current].forEach((stage) => {
      if (!stage) return;
      stage.scrollTo({ top: stage.scrollHeight, behavior: "smooth" });
    });
    setShowScrollLatest(false);
  }, [messages, sending]);

  function focusVisibleComposer() {
    const visibleTextarea = [mobileTextareaRef.current, desktopTextareaRef.current]
      .find((element) => element && element.getClientRects().length > 0);
    visibleTextarea?.focus();
  }

  async function selectModel(profile: ModelProfile["profile"]) {
    if (!conversation || sending || switchingModel || profile === conversation.model_profile) return;
    const previous = conversation;
    setConversation({ ...conversation, model_profile: profile });
    setSwitchingModel(true);
    try {
      const result = await updateModel(conversation.id, profile);
      setConversation(result.conversation);
    } catch {
      setConversation(previous);
      setError("模型切换失败，请重试。");
    } finally {
      setSwitchingModel(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = text.trim();
    if (!conversation || !content || sending || switchingModel || !selectedModel) return;
    if (balance < selectedModel.coin_cost) {
      setError("金币余额不足，暂时无法发送这条消息。");
      return;
    }
    const requestId = crypto.randomUUID();
    setText("");
    setMessages((current) => [...current, { id: requestId, message_id: requestId, role: "user", content, pending: true }]);
    setSending(true);
    setError(null);
    try {
      const result = await sendTurn(conversation.id, content, requestId);
      setMessages((current) => [
        ...current.map((item) => item.id === requestId ? { ...item, pending: false } : item),
        { id: result.reply.message_id ?? `reply-${requestId}`, message_id: result.reply.message_id, role: "assistant", content: result.reply.text },
      ]);
      setBalance(result.wallet.balance);
    } catch (sendError) {
      setMessages((current) => current.map((item) => item.id === requestId ? { ...item, pending: false, failed: true } : item));
      setError(sendError instanceof Error && sendError.message === "insufficient_coins" ? "金币余额不足。" : "消息没能发出去，请再试一次。");
      setText(content);
    } finally {
      setSending(false);
      focusVisibleComposer();
    }
  }

  async function confirmRestart() {
    if (!conversation || sending || switchingModel) return;
    setSending(true);
    try {
      const result = await restartConversation(conversation.id);
      setConversation(result.conversation);
      setMessages([]);
      setBalance(result.wallet.balance);
      setShowRestart(false);
      const presentationQuery = search.get("presentation");
      router.replace(`/chat/${params.characterId}?conversation=${result.conversation.id}${presentationQuery ? `&presentation=${presentationQuery}` : ""}`);
    } catch {
      setError("重新开始失败，请稍后再试。");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <ChatLoading />;
  if (!conversation) {
    return <main className="fatal-state"><h1>没有找到这段对话</h1><p>{error}</p><button onClick={() => router.push("/")}>返回角色列表</button></main>;
  }

  const character = conversation.character;
  const cover = presentation?.cover ?? chatCoverByCharacter[character.id] ?? "/characters/kai.svg";
  const displayName = presentation?.name ?? character.display_name;
  const tagline = presentation?.tagline ?? character.tagline;
  const experience = buildMockCharacterExperience(presentation, character);
  const { profile, viewer_state: viewerState, conversation_tools: conversationTools } = experience;
  const primaryBadge = profile.badges[0];
  const viewerHasLiked = liked ?? viewerState.has_liked;
  const viewerHasFavorited = favorited ?? viewerState.is_favorite;
  const visibleLikeCount = viewerState.like_count + Number(viewerHasLiked) - Number(viewerState.has_liked);
  const visibleFavoriteCount = viewerState.favorite_count + Number(viewerHasFavorited) - Number(viewerState.is_favorite);
  const inspirationPrompts = experience.inspiration_prompts.map((prompt) => prompt.replace("{{character}}", displayName));

  function scrollToLatest() {
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

  return (
    <main className="reference-chat-shell" style={{ "--accent": character.accent_color } as React.CSSProperties}>
      <Image className="chat-world-bg" src={cover} alt="" fill priority sizes="(min-width: 768px) 100vw, 1px" />
      <div className="chat-world-overlay" />

      <section className="mobile-chat-shell" aria-label={`${displayName} 移动端对话`}>
        <Image className="mobile-chat-background" src={cover} alt="" fill priority sizes="(max-width: 767px) 100vw, 1px" />
        <div className="mobile-chat-shade" />

        <header className="mobile-chat-header">
          <button className="mobile-round-button" onClick={() => router.push("/")} aria-label="返回角色列表"><BackIcon /></button>
          <button className="mobile-character-button" onClick={() => setShowMobileProfile(true)} aria-label="查看角色资料">
            <span><Image src={cover} alt="" fill sizes="34px" /></span>
            <b>{displayName}</b>
            {primaryBadge && <i title={primaryBadge.display_name}>✦</i>}
          </button>
        </header>

        <section
          className="mobile-message-stage"
          ref={mobileMessageStageRef}
          onScroll={(event) => {
            const stage = event.currentTarget;
            setShowScrollLatest(stage.scrollHeight - stage.scrollTop - stage.clientHeight > 72);
          }}
        >
          <div className="mobile-message-list">
            <p className="mobile-ai-notice">All responses are AI-generated. Characters are depicted as adults aged 18 or above.</p>
            <p className="mobile-encryption-note">Your chats and accounts are encrypted.</p>
            <div className="mobile-tagline"><b>Tagline:</b> “{tagline}”</div>
            <div className="mobile-opening">{character.greeting}</div>

            {messages.map((message) => (
              <div className={`mobile-message-row ${message.role}${message.failed ? " failed" : ""}`} key={`mobile-${message.id}`}>
                {message.role === "assistant" && <span className="mobile-message-avatar"><Image src={cover} alt="" fill sizes="28px" /></span>}
                <div className="mobile-message-stack">
                  <div className="mobile-bubble">{message.content}</div>
                  <small>{message.failed ? "发送失败" : message.pending ? "发送中…" : formatTime(message.created_at)}</small>
                </div>
              </div>
            ))}

            {sending && (
              <div className="mobile-message-row assistant">
                <span className="mobile-message-avatar"><Image src={cover} alt="" fill sizes="28px" /></span>
                <div className="typing"><i /><i /><i /></div>
              </div>
            )}
          </div>
          {showScrollLatest && <button className="mobile-scroll-latest" onClick={scrollToLatest} aria-label="回到最新消息"><ScrollLatestIcon /></button>}
        </section>

        <section className="mobile-composer-panel">
          {error && <div className="mobile-composer-error">{error}<button onClick={() => setError(null)}>×</button></div>}
          <div className="mobile-story-actions">
            <button onClick={() => setShowRestart(true)}><RestartIcon /><span>Restart</span></button>
            <button onClick={useInspiration}><InspirationIcon /><span>Inspire</span></button>
            <button onClick={() => void shareCharacter()}><ShareIcon /><span>Share</span></button>
            <button disabled><SceneImageIcon /><span>Image</span></button>
            <button disabled><SceneVideoIcon /><span>Video</span></button>
          </div>
          <div className="mobile-tool-row">
            <button className="mobile-role-chip" onClick={() => setMobileSheet("role")}><RoleIcon />Role Card</button>
            <span />
            <button onClick={() => setMobileSheet("model")} aria-label="切换模型"><ModelIcon /></button>
            <button onClick={() => setMobileSheet("pinned")} aria-label="查看置顶记忆"><NoteIcon /></button>
            <button onClick={() => setMobileSheet("more")} aria-label="更多设置"><MoreIcon /></button>
          </div>
          <form className="mobile-composer" onSubmit={submit}>
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
              disabled={sending || switchingModel}
            />
            <span>{selectedModel?.coin_cost ?? 0} ✦</span>
            <button type="submit" disabled={!text.trim() || sending || switchingModel} aria-label="发送消息"><SendIcon /></button>
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
                    <button className={viewerHasLiked ? "active" : ""} onClick={() => setLiked(!viewerHasLiked)}><ThumbIcon /><b>{visibleLikeCount}</b><small>Likes</small></button>
                    <button className={viewerHasFavorited ? "active" : ""} onClick={() => setFavorited(!viewerHasFavorited)}><HeartIcon /><b>{visibleFavoriteCount}</b><small>Favorites</small></button>
                  </div>
                </section>
                <h1>{displayName}{primaryBadge && <i title={primaryBadge.display_name}>✦</i>}</h1>
                <div className="mobile-profile-tags">{profile.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                <section className="mobile-profile-stats">
                  <div><small>Creator</small><strong><i>{profile.creator.display_name.slice(0, 1).toUpperCase()}</i>{profile.creator.display_name}</strong></div>
                  <div><small>Interactions</small><strong>{formatCompactCount(profile.stats.interaction_count)}</strong></div>
                  <div><small>Connectors</small><strong>{formatCompactCount(profile.stats.connector_count)}</strong></div>
                </section>
                <section className="mobile-profile-section">
                  <header><b>✦ Hot Comments 🔥</b><span>{profile.stats.comment_count.toLocaleString()}</span></header>
                  {profile.hot_comments.map((comment) => <article key={comment.id}><i>{comment.author.display_name.slice(0, 1).toUpperCase()}</i><div><b>{comment.author.display_name}</b><p>{comment.content}</p></div><span>♡ {comment.like_count}</span></article>)}
                </section>
                <section className="mobile-profile-section mobile-memory-section">
                  <header><b>✦ Memory</b><span>{profile.stats.memory_count}</span></header>
                  {profile.memories.map((memory) => <article key={memory.id}><i>∞</i><div><b>{memory.title}</b><p>{memory.engagement_count} moments</p></div></article>)}
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
                <button key={model.profile} className={model.profile === conversation.model_profile ? "selected" : ""} disabled={sending || switchingModel} onClick={() => { void selectModel(model.profile); setMobileSheet(null); }}><span><b>{model.display_name}</b><small>{model.coin_cost} coins / message</small></span><i>{model.profile === conversation.model_profile ? "✓" : ""}</i></button>
              ))}</div>}
              {mobileSheet === "role" && <div className="mobile-sheet-copy">{conversationTools.role_card ? <><span className="test-user-avatar">{conversationTools.role_card.display_name.slice(0, 1).toUpperCase()}</span><div><b>{conversationTools.role_card.display_name}</b><p>{conversationTools.role_card.description}</p></div></> : <p>No role card selected</p>}</div>}
              {mobileSheet === "pinned" && <div className="mobile-sheet-list">{conversationTools.pins.length === 0 ? <p><NoteIcon />No pinned memories</p> : conversationTools.pins.map((pin) => <p key={pin.id}>{pin.content}</p>)}</div>}
              {mobileSheet === "more" && <div className="mobile-sheet-menu"><button onClick={() => { setMobileSheet(null); setShowMobileProfile(true); }}><RoleIcon /><span><b>Character profile</b><small>View story details and memories</small></span></button><button onClick={() => { setMobileSheet(null); setShowRestart(true); }}><RestartIcon /><span><b>Restart story</b><small>Archive this chat and begin again</small></span></button></div>}
            </section>
          </div>
        )}
      </section>

      <header className="tipsy-header chat-site-header">
        <div className="tipsy-header-left">
          <Brand />
          <button className="community-pill"><span>☁</span><i />···</button>
          <button className="download-pill"><span>▣</span> Download</button>
        </div>
        <div className="tipsy-header-right">
          <button className="header-circle" aria-label="搜索"><SearchIcon /></button>
          <button className="create-pill">Create</button>
          <button className="header-circle" aria-label="切换语言"><GlobeIcon /></button>
          <CoinBadge balance={balance} compact />
          <button className="login-pill">Login</button>
        </div>
      </header>

      <div className={`reference-chat-workspace${showProfile ? "" : " profile-collapsed"}`}>
        {showProfile && (
          <aside className="role-profile" aria-label={`${displayName} 角色资料`}>
            <Image className="role-profile-cover" src={cover} alt={`${displayName} profile`} fill priority sizes="350px" />
            <div className="profile-image-shade" />
            <div className="profile-top-actions">
              <button className="cid-pill">CID: {character.id.replace("char_", "").slice(0, 5)}… <span>▣</span></button>
              <button className="hide-profile" onClick={() => setShowProfile(false)}>Hide Profile <span>›</span></button>
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

              <section className="profile-glass-card comments-card">
                <header><b>✦ Hot Comments 🔥</b><button>View All ({profile.stats.comment_count.toLocaleString()}) <span>›</span></button></header>
                {profile.hot_comments.map((comment, index) => (
                  <article className="profile-comment" key={comment.id}>
                    <span className={`comment-avatar ${index % 2 === 0 ? "coral" : "violet"}`}>{comment.author.display_name.slice(0, 1).toUpperCase()}</span>
                    <div><p><b>{comment.author.display_name}</b><time>{formatShortDate(comment.created_at)}</time></p><strong>{comment.content}</strong><button>View Translation</button></div>
                    <span className="comment-like">♡<small>{comment.like_count}</small></span>
                  </article>
                ))}
              </section>

              <section className="profile-glass-card memories-card">
                <header><b>✦ Memory</b><button>View All ({profile.stats.memory_count}) <span>›</span></button></header>
                {profile.memories.map((memory, index) => (
                  <article className="memory-row" key={memory.id}>
                    <span className="memory-avatars"><i>{index + 1}</i><i><Image src={cover} alt="" fill sizes="26px" /></i><b>∞</b></span>
                    <strong>{memory.title}</strong>
                    <span className="memory-count">▢<small>{memory.engagement_count}</small></span>
                  </article>
                ))}
              </section>

              <p className="profile-bottom-tagline">“{tagline}”</p>
            </div>
          </aside>
        )}

        <section className="reference-conversation">
          <header className="reference-conversation-toolbar">
            <div className="conversation-character-status">
              <button className="conversation-avatar" onClick={() => setShowProfile(true)} aria-label="显示角色资料"><Image src={cover} alt={displayName} fill sizes="48px" /></button>
              <div className="relationship-level has-tooltip" data-tooltip="Relationship level" aria-label={`关系等级 ${viewerState.relationship_level}`}><LevelIcon /><strong>Lv{viewerState.relationship_level}</strong></div>
            </div>
            <div className="conversation-toolbar-actions">
              <button className="conversation-stat-pill has-tooltip" data-tooltip="Story chapter" aria-label={`当前故事章节 ${viewerState.current_chapter}`}><BookIcon /><strong>{viewerState.current_chapter}</strong></button>
              <button className="conversation-stat-pill audio-mode has-tooltip" data-tooltip="Auto voice · coming soon" aria-label="自动朗读，暂未开放" disabled><MutedAutoIcon /><strong>Auto</strong></button>
              <button className={`conversation-stat-pill has-tooltip${viewerHasLiked ? " active" : ""}`} data-tooltip={viewerHasLiked ? "Unlike character" : "Like character"} aria-label={viewerHasLiked ? "取消点赞" : "点赞角色"} aria-pressed={viewerHasLiked} onClick={() => setLiked(!viewerHasLiked)}><ThumbIcon /><strong>{visibleLikeCount}</strong></button>
              <button className={`conversation-stat-pill favorite-stat has-tooltip${viewerHasFavorited ? " active" : ""}`} data-tooltip={viewerHasFavorited ? "Remove favorite" : "Favorite character"} aria-label={viewerHasFavorited ? "取消收藏角色" : "收藏角色"} aria-pressed={viewerHasFavorited} onClick={() => setFavorited(!viewerHasFavorited)}><HeartIcon /><strong>{visibleFavoriteCount}</strong></button>
              <button className="more-pill has-tooltip" data-tooltip="Layout & settings" onClick={() => setShowChatMenu((value) => !value)} aria-label="对话布局与设置"><MoreIcon /></button>
            </div>
            {showChatMenu && (
              <div className="chat-settings-popover">
                <button onClick={() => { setShowProfile(true); setShowChatMenu(false); }}><span>↺</span><div><b>恢复默认布局</b><small>显示角色资料与标准聊天宽度</small></div></button>
                <button onClick={() => { setShowChatMenu(false); setShowRestart(true); }}><span>＋</span><div><b>重新开始对话</b><small>归档当前记录并开启新会话</small></div></button>
              </div>
            )}
          </header>

          <section
            className="reference-message-stage"
            ref={desktopMessageStageRef}
            onScroll={(event) => {
              const stage = event.currentTarget;
              setShowScrollLatest(stage.scrollHeight - stage.scrollTop - stage.clientHeight > 72);
            }}
          >
            <div className="reference-message-list">
              <p className="ai-notice">All responses are AI-generated. All characters are depicted as adults aged 18 or above.</p>
              <p className="encryption-note">Your chats and accounts are encrypted.</p>
              <div className="tagline-note"><b>Tagline:</b> “{tagline}”</div>

              <div className="reference-opening">{character.greeting}</div>

              {messages.map((message) => (
                <div className={`reference-message-row ${message.role}${message.failed ? " failed" : ""}`} key={message.id}>
                  {message.role === "assistant" && <span className="reference-message-avatar"><Image src={cover} alt="" fill sizes="30px" /></span>}
                  <div className="reference-message-stack">
                    <div className="reference-bubble">{message.content}</div>
                    <small>{message.failed ? "发送失败" : message.pending ? "发送中…" : formatTime(message.created_at)}</small>
                  </div>
                </div>
              ))}

              {sending && (
                <div className="reference-message-row assistant">
                  <span className="reference-message-avatar"><Image src={cover} alt="" fill sizes="30px" /></span>
                  <div className="typing"><i /><i /><i /></div>
                </div>
              )}
            </div>
            {showScrollLatest && <button className="scroll-latest has-tooltip" data-tooltip="Back to latest" onClick={scrollToLatest} aria-label="回到最新消息"><ScrollLatestIcon /></button>}
          </section>

          <section className="reference-composer-panel">
            {error && <div className="composer-error">{error}<button onClick={() => setError(null)}>×</button></div>}
            {composerPanel === "model" && (
              <div className="composer-popover model-popover">
                <header><b>Story model</b><small>选择本轮对话使用的模型</small></header>
                {models.map((model) => (
                  <button
                    key={model.profile}
                    className={model.profile === conversation.model_profile ? "selected" : ""}
                    disabled={sending || switchingModel}
                    onClick={() => { void selectModel(model.profile); setComposerPanel(null); }}
                  >
                    <span><b>{model.display_name}</b><small>{model.coin_cost} coins / message</small></span>
                    <i>{model.profile === conversation.model_profile ? "✓" : ""}</i>
                  </button>
                ))}
              </div>
            )}
            {composerPanel === "role" && (
              <div className="composer-popover info-popover">
                <header><b>Role Card</b><button onClick={() => setComposerPanel(null)}>×</button></header>
                {conversationTools.role_card ? (
                  <><p><span className="test-user-avatar">{conversationTools.role_card.display_name.slice(0, 1).toUpperCase()}</span><strong>{conversationTools.role_card.display_name}</strong></p><small>{conversationTools.role_card.description} 首版使用默认测试身份，后续接入可编辑角色卡。</small></>
                ) : <p className="empty-pin"><RoleIcon /><strong>No role card selected</strong></p>}
              </div>
            )}
            {composerPanel === "pinned" && (
              <div className="composer-popover info-popover">
                <header><b>Pinned</b><button onClick={() => setComposerPanel(null)}>×</button></header>
                {conversationTools.pins.length === 0 ? <p className="empty-pin"><NoteIcon /><strong>No pinned memories</strong></p> : conversationTools.pins.map((pin) => <p key={pin.id}>{pin.content}</p>)}
                <small>置顶内容会作为长期事实参与后续对话。首版 fallback 不写入模型上下文。</small>
              </div>
            )}
            <div className="composer-tools">
              {!showProfile && <button onClick={() => setShowProfile(true)}><RoleIcon />Profile</button>}
              <button className="model-trigger has-tooltip" data-tooltip={selectedModel ? `${selectedModel.display_name} · ${selectedModel.coin_cost} coins` : "Select model"} onClick={() => setComposerPanel(composerPanel === "model" ? null : "model")} aria-label="选择对话模型"><ModelIcon /></button>
              <button onClick={() => setComposerPanel(composerPanel === "role" ? null : "role")}><RoleIcon />Role Card</button>
              <button onClick={() => setComposerPanel(composerPanel === "pinned" ? null : "pinned")}><NoteIcon />Pinned</button>
              <span />
              <button className="icon-only has-tooltip unavailable-tool" data-tooltip="Create image · coming soon" aria-label="生成场景图片，暂未开放" disabled><SceneImageIcon /></button>
              <button className="icon-only has-tooltip unavailable-tool" data-tooltip="Create video · coming soon" aria-label="生成场景视频，暂未开放" disabled><SceneVideoIcon /></button>
              <button className="icon-only has-tooltip unavailable-tool" data-tooltip="Media gallery · coming soon" aria-label="媒体图库，暂未开放" disabled><GalleryIcon /></button>
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
                placeholder="Enter to send, Shift+Enter for new line"
                rows={1}
                disabled={sending || switchingModel}
              />
              <span className="composer-cost">{selectedModel?.coin_cost ?? 0} ✦</span>
              <button type="submit" className="reference-send" disabled={!text.trim() || sending || switchingModel} aria-label="发送消息"><SendIcon /></button>
            </form>
          </section>
        </section>
      </div>

      <footer className="chat-reference-footer"><span>Supported Cards</span><a>Privacy Policy</a><a>Terms of Service</a><a>Community Guidelines</a><a>About Us</a><small>© 2026 FIBRE</small></footer>

      {showRestart && (
        <div className="modal-backdrop" onClick={() => setShowRestart(false)}>
          <div className="restart-modal" onClick={(event) => event.stopPropagation()}>
            <span className="modal-icon">↺</span><h2>重新开始这段关系？</h2>
            <p>当前聊天记录会被归档，新对话将从角色的开场白重新开始。</p>
            <div><button className="secondary" onClick={() => setShowRestart(false)}>取消</button><button className="danger" onClick={() => void confirmRestart()}>重新开始</button></div>
          </div>
        </div>
      )}
    </main>
  );
}
