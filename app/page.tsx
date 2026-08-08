"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand, CoinBadge } from "@/components/brand";
import { ApiError, createConversation, getBootstrap, getFeed, logout, redeemAccessCode } from "@/lib/api";
import { formatCompactCount } from "@/lib/format";
import type { AuthUser, FeedCharacter } from "@/lib/types";

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.3 4.3" /></svg>;
}

function GlobeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.3 2.4 3.4 5.4 3.4 9S14.3 18.6 12 21M12 3C9.7 5.4 8.6 8.4 8.6 12s1.1 6.6 3.4 9" /></svg>;
}

function MessageIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z" /></svg>;
}

function VoiceIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 10v4" /></svg>;
}

function FilterIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M8 12h8M10.5 17h3" /></svg>;
}

function FeedSkeleton() {
  return (
    <div className="tipsy-grid" aria-label="正在加载角色">
      {Array.from({ length: 10 }, (_, item) => <div className="tipsy-card card-skeleton" key={item} />)}
    </div>
  );
}

function AccessDialog({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [displayName, setDisplayName] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!displayName.trim() || !accessCode.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await redeemAccessCode(accessCode.trim(), displayName.trim());
      onAuthenticated(result.user);
    } catch (loginError) {
      setError(loginError instanceof ApiError && loginError.message === "invalid_access_code"
        ? "邀请码无效或已过期，请联系测试负责人。"
        : "暂时无法登录，请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="access-overlay" role="dialog" aria-modal="true" aria-labelledby="access-title">
      <form className="access-card" onSubmit={submit}>
        <Brand />
        <span className="access-kicker">PRIVATE BETA</span>
        <h1 id="access-title">进入 Plum Chat</h1>
        <p>使用测试负责人发给你的一次性邀请码。你的聊天、金币和收藏都会独立保存。</p>
        <label><span>你的称呼</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} autoComplete="nickname" placeholder="例如：Alice" /></label>
        <label><span>邀请码</span><input value={accessCode} onChange={(event) => setAccessCode(event.target.value)} maxLength={160} autoComplete="one-time-code" placeholder="plum_…" /></label>
        {error && <div className="access-error">{error}</div>}
        <button className="access-submit" disabled={submitting || !displayName.trim() || !accessCode.trim()}>{submitting ? "正在进入…" : "进入 Plum Chat"}</button>
        <small>邀请码只会绑定一个测试账号，请勿转发。</small>
      </form>
    </div>
  );
}

export default function FeedPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<FeedCharacter[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [bootstrap, feed] = await Promise.all([getBootstrap(), getFeed()]);
      setBalance(bootstrap.wallet.balance);
      setUser(bootstrap.user);
      setCharacters(feed.items);
      setAuthRequired(false);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        setAuthRequired(true);
        setCharacters([]);
        return;
      }
      setError("暂时没能连接角色世界，请确认本地后端已经启动。");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    try { await logout(); } catch { /* session may already be gone */ }
    setUser(null);
    setBalance(0);
    setCharacters([]);
    setAuthRequired(true);
  }

  useEffect(() => {
    void load();
  }, []);

  async function openCharacter(character: FeedCharacter) {
    if (openingId) return;
    setOpeningId(character.id);
    setError(null);
    try {
      const result = await createConversation(character.id);
      router.push(`/chat/${character.id}?conversation=${result.conversation.id}`);
    } catch (openError) {
      if (openError instanceof ApiError && openError.status === 401) {
        setAuthRequired(true);
        setOpeningId(null);
        return;
      }
      setError("进入聊天失败了，请稍后再试。");
      setOpeningId(null);
    }
  }

  return (
    <main className="tipsy-feed-shell">
      <header className="tipsy-header">
        <div className="tipsy-header-left">
          <Brand />
          <button className="community-pill" aria-label="Plum 社区"><span>☁</span><i />···</button>
          <button className="download-pill"><span>▣</span> Download</button>
        </div>
        <div className="tipsy-header-right">
          <button className="header-circle" aria-label="搜索"><SearchIcon /></button>
          <button className="create-pill">Create</button>
          <button className="header-circle" aria-label="切换语言"><GlobeIcon /></button>
          <CoinBadge balance={balance} compact />
          {user ? <button className="login-pill" onClick={() => void signOut()} title="退出当前测试账号">{user.display_name}</button> : <button className="login-pill" onClick={() => setAuthRequired(true)}>Login</button>}
        </div>
      </header>

      <section className="feed-content">
        <div className="feed-controls">
          <nav className="feed-tabs" aria-label="发现分类">
            {['For You', 'Trending', 'Worlds', 'Latest', 'Popular', 'Following'].map((label, index) => (
              <button className={index === 0 ? "active" : ""} key={label}>{label}</button>
            ))}
          </nav>
          <div className="feed-filters">
            <div className="limitless-copy"><b>Limitless</b><small>Enable to show Limitless on iOS</small></div>
            <button className="toggle" aria-label="Limitless"><i /></button>
            <button className="gender-filter">All <span>▾</span></button>
            <button className="filter-button" aria-label="筛选"><FilterIcon /></button>
          </div>
        </div>

        {error && <div className="error-banner"><span>{error}</span><button onClick={() => void load()}>重新加载</button></div>}

        {loading ? (
          <FeedSkeleton />
        ) : (
          <div className="tipsy-grid">
            {characters.map((character, index) => {
              const badge = character.badges[0];
              const creator = character.creator?.display_name ?? "plum";
              return (
              <article className="tipsy-card" key={character.id}>
                <button
                  className="card-hit-area"
                  onClick={() => void openCharacter(character)}
                  disabled={openingId !== null}
                  aria-label={`和 ${character.display_name} 开始聊天`}
                >
                  <Image
                    className="tipsy-card-cover"
                    src={character.cover_ref ?? "/characters/kai.svg"}
                    alt={character.display_name}
                    fill
                    priority={index < 5}
                    sizes="(max-width: 700px) 50vw, (max-width: 1100px) 25vw, 20vw"
                  />
                  <span className="card-darken" />
                  {badge && <span className="card-badge">✦ {badge.display_name}</span>}
                  {openingId === character.id && <span className="opening-card">Entering story…</span>}
                  <span className="card-copy">
                    <strong>{character.display_name}{character.capabilities.voice && <VoiceIcon />}</strong>
                    <span>{character.tagline}</span>
                  </span>
                  <span className="card-footer">
                    <span className="creator"><i>{creator.slice(0, 1).toUpperCase()}</i><b>@{creator}</b></span>
                    <span className="chat-count"><MessageIcon />{formatCompactCount(character.interaction_count)}</span>
                  </span>
                </button>
              </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="reference-footer">
        <span>Supported Cards</span><i />
        <a>Privacy Policy</a><a>Terms of Service</a><a>Community Guidelines</a><a>Beginner&apos;s Guide</a><a>About Us</a>
        <small>© 2026 PLUM. All rights reserved.</small>
      </footer>
      {authRequired && <AccessDialog onAuthenticated={(authenticatedUser) => { setUser(authenticatedUser); void load(); }} />}
    </main>
  );
}
