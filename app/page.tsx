"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { CommunityLink } from "@/components/community-link";
import { ApiError, createConversation, getFeed, logout } from "@/lib/api";
import { EmailSignInDialog, PlumAuthProvider, usePlumAuth, WelcomeDialog } from "@/components/plum-auth";
import { formatCompactCount } from "@/lib/format";
import type { AuthUser, FeedCharacter } from "@/lib/types";

const MAIN_TABS = ["For You", "Trending", "Latest", "Popular", "Following"] as const;
const HOT_SEARCHES = ["Slow burn", "Enemies to lovers", "Fantasy", "Protective", "After hours"];

function SearchIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.3 4.3" /></svg>; }
function CreateIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>; }
function FilterIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M8 12h8M10.5 17h3" /></svg>; }
function MessageIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z" /></svg>; }
function LoginIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.8-4 2.9-6 6.5-6s5.7 2 6.5 6" /></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>; }
function TranslationIcon() { return <svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M550.761 343.763l1.717 3.313 122.97 281.118a26.353 26.353 0 0 1-46.772 24.064l-1.506-2.952-31.533-72.071H461.011l-31.503 72.071a26.353 26.353 0 0 1-49.423-18.01l1.114-3.102 123-281.118a26.383 26.383 0 0 1 46.562-3.313zm-22.407 79.601-44.273 101.165h88.516l-44.273-101.165z" /><path d="M521.306 120.471a377.826 377.826 0 0 1 370.146 302.2 26.353 26.353 0 1 1-51.621 10.481 325.12 325.12 0 0 0-623.195-48.489l-.903 2.56 58.307-19.426a26.353 26.353 0 0 1 32.106 13.583l1.204 3.072a26.353 26.353 0 0 1-13.552 32.106l-3.103 1.204-105.411 35.147a26.353 26.353 0 0 1-34.154-30.238 377.826 377.826 0 0 1 370.146-302.2zm334.878 423.393a26.353 26.353 0 0 1 35.298 29.847 377.826 377.826 0 0 1-740.352 0 26.353 26.353 0 0 1 51.652-10.481 325.12 325.12 0 0 0 620.213 56.23l2.891-7.469-42.134 16.203a26.353 26.353 0 0 1-32.678-12.107l-1.385-3.012a26.353 26.353 0 0 1 12.137-32.678l3.012-1.385 91.346-35.148z" /></svg>; }

function LoadingState() {
  return <div className="feed-loading" aria-label="正在加载角色"><i /><span>Loading characters…</span></div>;
}

function FeedContent() {
  const router = useRouter();
  const { context, loading: authLoading, refresh } = usePlumAuth();
  const [characters, setCharacters] = useState<FeedCharacter[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | "create" | null>(null);
  const [activeTab, setActiveTab] = useState<(typeof MAIN_TABS)[number]>("For You");
  const [limitless, setLimitless] = useState(false);
  const [gender, setGender] = useState("All");
  const [genderOpen, setGenderOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);

  const availableTags = useMemo(() => Array.from(new Set(characters.flatMap((character) => character.tags))).slice(0, 12), [characters]);
  const visibleCharacters = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    let items = characters.filter((character) => !query || [character.display_name, character.tagline, character.intro, ...character.tags].join(" ").toLowerCase().includes(query));
    if (selectedTags.length) items = items.filter((character) => selectedTags.every((tag) => character.tags.includes(tag)));
    if (activeTab === "Trending") items = items.filter((character) => character.badges.some((badge) => badge.code.toLowerCase().includes("trend") || badge.display_name.toLowerCase().includes("trend")));
    if (activeTab === "Latest") items = items.filter((character) => character.badges.some((badge) => badge.code.toLowerCase().includes("new") || badge.display_name.toLowerCase().includes("new")));
    if (activeTab === "Popular") items = [...items].sort((a, b) => b.interaction_count - a.interaction_count);
    if (activeTab === "Following") items = [];
    return items;
  }, [activeTab, characters, searchText, selectedTags]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const feed = await getFeed();
      setCharacters(feed.items);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError && loadError.status === 503
          ? "Plum Chat 暂时未开放，请稍后再来。"
          : "暂时没能连接角色世界，请确认本地后端已经启动。",
      );
    }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!context) return;
    if (context.actor.kind === "member") { setUser(context.actor.user); setBalance(context.wallet?.balance ?? 0); }
    else { setUser(null); setBalance(0); }
  }, [context]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("login") === "1") setLoginOpen(true);
    if (query.get("search") === "1") setSearchOpen(true);
  }, []);

  async function enterCharacter(characterId: string, skipAuth = false) {
    if (openingId) return;
    if (authLoading) return;
    if (!skipAuth && (!context || context.actor.kind === "visitor" || (context.actor.kind === "guest" && !context.actor.profile_complete))) {
      setPendingTarget(characterId); setWelcomeOpen(true); return;
    }
    setOpeningId(characterId); setError(null);
    try {
      const result = await createConversation(characterId);
      router.push(`/chat/${characterId}?conversation=${result.conversation.id}`);
    } catch (openError) {
      setOpeningId(null);
      if (openError instanceof ApiError && openError.status === 401) { setPendingTarget(characterId); setWelcomeOpen(true); return; }
      setError("进入聊天失败了，请稍后再试。");
    }
  }

  async function signOut() {
    try { await logout(); } catch { /* an expired session is already signed out */ }
    setUser(null); setBalance(0); setAccountOpen(false); void refresh();
  }

  function openCreate() {
    if (!user) { setPendingTarget("create"); setLoginOpen(true); return; }
    router.push("/create");
  }

  function afterAuthentication(authenticatedUser: AuthUser) {
    setUser(authenticatedUser); setLoginOpen(false);
    const target = pendingTarget; setPendingTarget(null);
    if (target === "create") router.push("/create");
    else if (target) void enterCharacter(target);
  }

  function clearFilters() { setLimitless(false); setGender("All"); setSelectedTags([]); }

  return <main className="character-feed-shell">
    <header className="site-header">
      <div className="header-brand-group"><Brand /><CommunityLink /></div>
      <div className="site-header-actions">
        <button className="header-circle" aria-label="搜索" aria-expanded={searchOpen} onClick={() => setSearchOpen((value) => !value)}><SearchIcon /></button>
        <button className="header-circle" aria-label="创作" title="创作" onClick={openCreate}><CreateIcon /></button>
        <div className="header-menu-wrap">
          <button className="header-circle language-symbol" aria-label="切换语言" aria-expanded={languageOpen} onClick={() => setLanguageOpen((value) => !value)}><TranslationIcon /></button>
          {languageOpen && <div className="header-dropdown language-menu"><button className="selected">简体中文 <span>✓</span></button><button>English</button><small>更多语言后续接入</small></div>}
        </div>
        {user && <div className="header-menu-wrap"><button className="coin-button" onClick={() => setWalletOpen((value) => !value)} aria-label={`金币余额 ${balance}`}><span>✦</span><strong>{balance.toLocaleString("zh-CN")}</strong></button>
          {walletOpen && <div className="header-dropdown wallet-panel"><small>金币余额</small><strong>{balance.toLocaleString("zh-CN")}</strong><h3>消费记录</h3><p>暂无消费记录</p><button disabled>充值入口 · 后续开放</button></div>}
        </div>}
        {user ? <div className="header-menu-wrap"><button className="account-button" onClick={() => setAccountOpen((value) => !value)} aria-label="用户设置"><i>{user.display_name.slice(0, 1).toUpperCase()}</i><span>{user.display_name}</span><b>⌄</b></button>
          {accountOpen && <div className="header-dropdown account-menu"><button onClick={() => router.push("/studio")}>My Studio</button><button disabled>账户设置 · 后续填充</button><button onClick={() => void signOut()}>退出登录</button></div>}
        </div> : <button className="header-circle" aria-label="登录" onClick={() => setLoginOpen(true)}><LoginIcon /></button>}
      </div>
      {searchOpen && <div className="enhanced-search"><SearchIcon /><input autoFocus value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索角色、设定或标签" /><button onClick={() => { setSearchText(""); setSearchOpen(false); }} aria-label="关闭搜索"><CloseIcon /></button><div><small>热门搜索</small>{HOT_SEARCHES.map((term) => <button key={term} onClick={() => setSearchText(term)}>{term}</button>)}</div></div>}
    </header>

    <section className="feed-content">
      <div className="feed-controls">
        <nav className="feed-tabs" aria-label="发现分类">{MAIN_TABS.map((label) => <button className={activeTab === label ? "active" : ""} key={label} onClick={() => setActiveTab(label)}>{label}</button>)}</nav>
        <div className="feed-filters">
          <button className={`limitless-switch${limitless ? " active" : ""}`} aria-pressed={limitless} onClick={() => setLimitless((value) => !value)}><span>Limitless</span><i /></button>
          <div className="gender-menu-wrap">
            <button className="gender-filter" aria-label="角色性别" aria-expanded={genderOpen} onClick={() => setGenderOpen((value) => !value)}><span>{gender}</span><i>⌄</i></button>
            {genderOpen && <div className="gender-menu">{["All", "Female", "Male", "Other"].map((option) => <button className={gender === option ? "selected" : ""} key={option} onClick={() => { setGender(option); setGenderOpen(false); }}><span>{option}</span>{gender === option && <i>✓</i>}</button>)}</div>}
          </div>
          <div className="tag-filter-wrap">
            <button className={`filter-button${selectedTags.length ? " active" : ""}`} aria-label="筛选标签" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}><FilterIcon /></button>
            {filtersOpen && <div className="tag-filter-panel"><header><strong>筛选标签</strong><button onClick={() => setFiltersOpen(false)} aria-label="关闭标签筛选"><CloseIcon /></button></header><div>{availableTags.map((tag) => <button className={selectedTags.includes(tag) ? "active" : ""} key={tag} onClick={() => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])}>{tag}</button>)}</div><small>标签生产流程将在后续版本接入。</small></div>}
          </div>
        </div>
      </div>
      {error && <div className="error-banner"><span>{error}</span><button onClick={() => void load()}>重新加载</button></div>}
      {loading ? <LoadingState /> : visibleCharacters.length === 0 ? <div className="feed-empty"><strong>没有找到符合条件的角色</strong><button onClick={clearFilters}>清除筛选</button></div> : <div className="character-grid">{visibleCharacters.map((character, index) => <article className="character-card" key={character.id}>
        <button className="card-hit-area" onClick={() => void enterCharacter(character.id)} disabled={openingId !== null} aria-label={`和 ${character.display_name} 开始聊天`}>
          <Image className="character-card-cover" src={character.cover_ref ?? "/characters/kai.svg"} alt={character.display_name} fill priority={index < 6} sizes="(max-width: 560px) 50vw, (max-width: 900px) 33vw, 20vw" />
          <span className="card-darken" />
          {openingId === character.id && <span className="opening-card">Entering story…</span>}
          <span className="card-copy"><strong>{character.display_name}</strong><span className="card-meta-row"><span className="chat-count"><MessageIcon />{formatCompactCount(character.interaction_count)}</span>{character.tags.slice(0, 3).map((tag, tagIndex) => <span className={`character-tag${tagIndex === 2 ? " character-tag-tertiary" : ""}`} key={tag}>{tag}</span>)}</span><span className="card-tagline">{character.tagline}</span></span>
          <span className="card-hover-detail"><i className="hover-avatar"><Image src={character.avatar_ref ?? character.cover_ref ?? "/characters/kai.svg"} alt="" fill sizes="52px" /></i><span>{character.intro || character.tagline}</span><b><MessageIcon />Chat Now</b></span>
        </button>
      </article>)}</div>}
    </section>
    <footer className="reference-footer"><a>Privacy Policy</a><a>Terms of Service</a><a>Community Guidelines</a><a>About Us</a><small>© 2026 PLUM. All rights reserved.</small></footer>
    {welcomeOpen && <WelcomeDialog onComplete={() => { setWelcomeOpen(false); const target = pendingTarget; setPendingTarget(null); if (target === "create") setLoginOpen(true); else if (target) void enterCharacter(target, true); }} onClose={() => { setWelcomeOpen(false); setPendingTarget(null); }} />}
    {loginOpen && <EmailSignInDialog returnTo={pendingTarget === "create" ? "/create" : undefined} onAuthenticated={afterAuthentication} onClose={() => { setLoginOpen(false); setPendingTarget(null); }} />}
  </main>;
}

export default function FeedPage() {
  // OAuth callback returns to the feed; refresh the server-owned auth context.
  return <PlumAuthProvider><FeedContent /></PlumAuthProvider>;
}
