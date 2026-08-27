"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { CommunityLink } from "@/components/community-link";
import { ApiError, createConversation, getFeed, logout } from "@/lib/api";
import { EmailSignInDialog, PlumAuthProvider, WelcomeDialog, usePlumAuth } from "@/components/plum-auth";
import { formatCompactCount } from "@/lib/format";
import type { AuthUser, FeedCharacter } from "@/lib/types";
import { CloseIcon, CreateIcon, FilterIcon, LoginIcon, MessageIcon, SearchIcon, TranslationIcon } from "@/components/icons";

const MAIN_TABS = ["For You", "Trending", "Latest", "Popular", "Following"] as const;
const HOT_SEARCHES = ["Slow burn", "Enemies to lovers", "Fantasy", "Protective", "After hours"];

function LoadingState() {
  return <div className="feed-loading" aria-label="正在加载角色"><i /><span>Loading characters…</span></div>;
}

function FeedContent() {
  const router = useRouter();
  const { context, loading: authLoading, refresh, ensureGuest } = usePlumAuth();
  const [characters, setCharacters] = useState<FeedCharacter[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | "create" | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
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

  async function enterCharacter(characterId: string) {
    if (openingId || authLoading) return;
    setOpeningId(characterId); setError(null);
    try {
      // Preferred flow: guests browse and enter freely; the Welcome appears inside the
      // chat room (~2s after the opening line). This requires the backend to allow a
      // profile-less guest to create a conversation.
      if (!context || context.actor.kind === "visitor") await ensureGuest();
      const result = await createConversation(characterId);
      router.push(`/chat/${characterId}?conversation=${result.conversation.id}`);
    } catch (openError) {
      setOpeningId(null);
      // Fallback while the backend still requires a completed profile first
      // (403 guest_profile_required): show the Welcome as a pre-chat gate, then retry.
      if (openError instanceof ApiError && (openError.status === 403 || openError.status === 401)) {
        setPendingTarget(characterId); setWelcomeOpen(true); return;
      }
      setError("Could not start the chat. Please try again later.");
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
    {loginOpen && <EmailSignInDialog returnTo={pendingTarget === "create" ? "/create" : undefined} onAuthenticated={afterAuthentication} onClose={() => { setLoginOpen(false); setPendingTarget(null); }} />}
    {welcomeOpen && <WelcomeDialog onComplete={() => { setWelcomeOpen(false); const target = pendingTarget; setPendingTarget(null); if (target && target !== "create") void enterCharacter(target); }} onClose={() => { setWelcomeOpen(false); setPendingTarget(null); }} />}
  </main>;
}

export default function FeedPage() {
  // OAuth callback returns to the feed; refresh the server-owned auth context.
  return <PlumAuthProvider><FeedContent /></PlumAuthProvider>;
}
