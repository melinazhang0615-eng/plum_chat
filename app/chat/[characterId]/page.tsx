"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Brand, CoinBadge } from "@/components/brand";
import {
  createConversation,
  getConversation,
  restartConversation,
  sendTurn,
  updateModel,
} from "@/lib/api";
import type { ChatMessage, Conversation, ModelProfile } from "@/lib/types";

const coverById: Record<string, string> = {
  char_luna: "/characters/luna.svg",
  char_kai: "/characters/kai.svg",
};

function formatTime(value?: string) {
  if (!value) return "刚刚";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "+08:00";
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? "刚刚"
    : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function BackIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>;
}

function MoreIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
}

function SendIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 5 16 7-16 7 3-7-3-7Z" /><path d="M7 12h13" /></svg>;
}

function ChatLoading() {
  return (
    <main className="chat-loading">
      <div className="loading-mark"><i /><i /><i /></div>
      <p>正在走进角色的世界…</p>
    </main>
  );
}

export default function ChatPage() {
  const params = useParams<{ characterId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const messageStageRef = useRef<HTMLElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  const selectedModel = useMemo(
    () => models.find((item) => item.profile === conversation?.model_profile),
    [models, conversation?.model_profile],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      let conversationId = search.get("conversation");
      if (!conversationId) {
        const created = await createConversation(params.characterId);
        conversationId = created.conversation.id;
        router.replace(`/chat/${params.characterId}?conversation=${conversationId}`);
      }
      const detail = await getConversation(conversationId);
      setConversation(detail.conversation);
      setMessages(detail.messages);
      setModels(detail.models);
      setBalance(detail.wallet.balance);
    } catch {
      setError("聊天暂时加载失败，请返回后重试。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [params.characterId]);

  useEffect(() => {
    const stage = messageStageRef.current;
    if (stage) {
      stage.scrollTo({ top: stage.scrollHeight, behavior: "smooth" });
    }
  }, [messages, sending]);

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
    const optimisticUser: ChatMessage = {
      id: requestId,
      message_id: requestId,
      role: "user",
      content,
      pending: true,
    };
    setText("");
    setMessages((current) => [...current, optimisticUser]);
    setSending(true);
    setError(null);
    try {
      const result = await sendTurn(conversation.id, content, requestId);
      setMessages((current) => [
        ...current.map((item) => item.id === requestId ? { ...item, pending: false } : item),
        {
          id: result.reply.message_id ?? `reply-${requestId}`,
          message_id: result.reply.message_id,
          role: "assistant",
          content: result.reply.text,
        },
      ]);
      setBalance(result.wallet.balance);
    } catch (sendError) {
      setMessages((current) => current.map((item) =>
        item.id === requestId ? { ...item, pending: false, failed: true } : item,
      ));
      setError(
        sendError instanceof Error && sendError.message === "insufficient_coins"
          ? "金币余额不足。"
          : "消息没能发出去，请再试一次。",
      );
      setText(content);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
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
      router.replace(`/chat/${params.characterId}?conversation=${result.conversation.id}`);
    } catch {
      setError("重新开始失败，请稍后再试。");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <ChatLoading />;
  if (!conversation) {
    return (
      <main className="fatal-state">
        <h1>没有找到这段对话</h1>
        <p>{error}</p>
        <button onClick={() => router.push("/")}>返回角色列表</button>
      </main>
    );
  }

  const character = conversation.character;
  const cover = coverById[character.id] ?? "/characters/luna.svg";

  return (
    <main className="chat-shell" style={{ "--accent": character.accent_color } as React.CSSProperties}>
      <Image className="world-backdrop" src={cover} alt="" fill priority sizes="100vw" />
      <div className="world-vignette" />

      <header className="chat-global-header">
        <div className="chat-brand-group">
          <button className="glass-icon" onClick={() => router.push("/")} aria-label="返回角色列表"><BackIcon /></button>
          <Brand />
        </div>
        <div className="session-chip"><i /> 私密对话已连接</div>
        <div className="chat-global-actions">
          <CoinBadge balance={balance} compact />
          <button className="glass-icon" onClick={() => setShowRestart(true)} aria-label="对话设置"><MoreIcon /></button>
        </div>
      </header>

      <div className="chat-workspace">
        <aside className="profile-panel">
          <Image className="profile-cover" src={cover} alt={`${character.display_name}的角色立绘`} fill priority sizes="380px" />
          <div className="profile-gradient" />
          <div className="profile-status"><i /> 正在线上</div>
          <div className="profile-copy">
            <div className="profile-label">YOUR STORY WITH</div>
            <h1>{character.display_name}</h1>
            <p>“{character.tagline}”</p>
            <div className="profile-tags">
              {character.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
            <div className="profile-story-note">
              <span>关系进度</span>
              <b>初次相遇 · 今晚</b>
            </div>
          </div>
        </aside>

        <section className="conversation-panel">
          <header className="conversation-toolbar">
            <div className="conversation-identity">
              <span className="portrait-avatar"><Image src={cover} alt="" fill sizes="48px" /></span>
              <div>
                <h2>{character.display_name}</h2>
                <p><i /> 在线 · 通常秒回</p>
              </div>
            </div>
              <button className="restart-link" onClick={() => setShowRestart(true)} disabled={sending || switchingModel}>↺ 重新开始</button>
          </header>

          <section className="message-stage" ref={messageStageRef}>
            <div className="message-list">
              <div className="conversation-date"><span /> 今天 <span /></div>
              <div className="story-prologue">
                <span>故事开始</span>
                <p>{character.intro}</p>
              </div>
              <div className="character-opening">
                <span className="message-avatar"><Image src={cover} alt="" fill sizes="34px" /></span>
                <div>
                  <span>{character.display_name} · {formatTime()}</span>
                  <p>{character.greeting}</p>
                </div>
              </div>

              {messages.map((message) => (
                <div className={`message-row ${message.role}${message.failed ? " failed" : ""}`} key={message.id}>
                  {message.role === "assistant" && <span className="message-avatar"><Image src={cover} alt="" fill sizes="34px" /></span>}
                  <div className="message-stack">
                    <div className="message-bubble">{message.content}</div>
                    <span>{message.failed ? "发送失败" : message.pending ? "发送中…" : formatTime(message.created_at)}</span>
                  </div>
                </div>
              ))}

              {sending && (
                <div className="message-row assistant typing-row">
                  <span className="message-avatar"><Image src={cover} alt="" fill sizes="34px" /></span>
                  <div className="typing"><i /><i /><i /></div>
                </div>
              )}
              <div ref={listEndRef} />
            </div>
          </section>

          <section className="composer-panel">
            {error && <div className="composer-error">{error}<button onClick={() => setError(null)}>×</button></div>}
            <div className="model-strip">
              <div className="mode-label"><span>✦</span><div><small>当前模式</small><b>{switchingModel ? "切换中…" : selectedModel?.display_name ?? "选择中"}</b></div></div>
              <div className="model-options" role="group" aria-label="切换对话模型">
                {models.map((model) => (
                  <button
                    key={model.profile}
                    className={model.profile === conversation.model_profile ? "active" : ""}
                    onClick={() => void selectModel(model.profile)}
                    disabled={sending || switchingModel}
                    title={model.description}
                  >
                    {model.display_name}<small>{model.coin_cost} ✦</small>
                  </button>
                ))}
              </div>
            </div>
            <form className="composer" onSubmit={submit}>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(event) => setText(event.target.value.slice(0, 2000))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={`给${character.display_name}发一条消息…`}
                rows={1}
                disabled={sending || switchingModel}
              />
              <div className="composer-meta">
                <span>{text.length ? `${text.length}/2000` : `本条消耗 ${selectedModel?.coin_cost ?? 0} 金币`}</span>
                <button type="submit" disabled={!text.trim() || sending || switchingModel} aria-label="发送消息"><SendIcon /></button>
              </div>
            </form>
            <p className="cost-note">AI 生成内容仅供娱乐 · Enter 发送，Shift + Enter 换行</p>
          </section>
        </section>
      </div>

      {showRestart && (
        <div className="modal-backdrop" onClick={() => setShowRestart(false)}>
          <div className="restart-modal" onClick={(event) => event.stopPropagation()}>
            <span className="modal-icon">↺</span>
            <h2>重新开始这段关系？</h2>
            <p>当前聊天记录会被归档，新对话将从角色的开场白重新开始。</p>
            <div>
              <button className="secondary" onClick={() => setShowRestart(false)}>取消</button>
              <button className="danger" onClick={() => void confirmRestart()}>重新开始</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
