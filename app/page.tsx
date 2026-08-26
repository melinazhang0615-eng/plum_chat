"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { AccountDropdown } from "@/components/account-dropdown";
import { CommunityLink } from "@/components/community-link";
import { CloseIcon, CreateIcon, SearchIcon, TranslationIcon } from "@/components/icons";
import { ApiError, FEED_TAGS_MAX, createConversation, getFeed, logout } from "@/lib/api";
import type { FeedGender, FeedRating } from "@/lib/api";
import { EmailSignInDialog, WelcomeDialog, usePlumAuth } from "@/components/plum-auth";
import { HEADER_LABELS, LANGUAGE_MENU, WALLET_PANEL } from "@/lib/copy";
import { errorMessage } from "@/lib/error-messages";
import { formatCoins, formatCompactCount } from "@/lib/format";
import { MATURE_CONTENT_NOT_ALLOWED_MESSAGE, preferenceToFeedGender, profileAllowsMature } from "@/lib/audience-policy";
import type { AuthUser, FeedCharacter, GuestProfile } from "@/lib/types";
import styles from "./page.module.css";

const MAIN_TABS = ["For You", "Trending", "Latest", "Popular", "Following"] as const;
const HOT_SEARCHES = ["Slow burn", "Enemies to lovers", "Fantasy", "Protective", "After hours"];
/** 按键即请求会把每个字都变成一次全表 ILIKE；300ms 是"打完一个词"和"感觉不到延迟"的交点。 */
const SEARCH_DEBOUNCE_MS = 300;
const TAG_VOCABULARY_MAX = 12;
/**
 * 菜单文案 → `plum_characters.gender` 的取值。`All` 是"这一项不参与筛选"，不是一个取值，
 * 所以它的 value 是 `null` 而不是空串——空串会被当成"筛一个叫空串的性别"发出去。
 */
const GENDER_OPTIONS: ReadonlyArray<{ label: string; value: FeedGender | null }> = [
  { label: "All", value: null },
  { label: "Female", value: "female" },
  { label: "Male", value: "male" },
  { label: "Other", value: "non_binary" },
];

function FilterIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M8 12h8M10.5 17h3" /></svg>; }
function MessageIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z" /></svg>; }
function LoginIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.8-4 2.9-6 6.5-6s5.7 2 6.5 6" /></svg>; }

function LoadingState() {
  return <div className="feed-loading" aria-label="Loading characters"><i /><span>Loading characters…</span></div>;
}

function FeedContent() {
  const router = useRouter();
  const { context, loading: authLoading, refresh, ensureGuest } = usePlumAuth();
  const [characters, setCharacters] = useState<FeedCharacter[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [tagVocabulary, setTagVocabulary] = useState<string[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | "create" | null>(null);
  const [pendingMatureAction, setPendingMatureAction] = useState<"filter" | string | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<(typeof MAIN_TABS)[number]>("For You");
  const [limitless, setLimitless] = useState(false);
  const [gender, setGender] = useState("All");
  const [genderOpen, setGenderOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  /** 去抖之后真正发给服务端的词；`searchText` 只驱动输入框。 */
  const [query, setQuery] = useState("");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preferenceAppliedFor = useRef<string | null>(null);
  const audienceProfile = context?.actor.kind === "visitor" ? null : context?.actor.profile ?? null;

  // 标签清单来自"未筛选那一页"，而不是当前列表：一旦按标签筛过，列表里只剩共现的标签，
  // 面板会把用户刚选中的那个标签也弄丢，于是选了就取消不掉。选中项始终并进来兜底。
  const availableTags = useMemo(
    () => Array.from(new Set([...tagVocabulary, ...selectedTags])),
    [tagVocabulary, selectedTags],
  );
  // 搜索和标签已经在服务端做完了，这里只剩几个 tab 的本地后处理。
  // 已知取舍：这些 tab 只作用于**已加载的页**，因为 Trending/Latest 靠 badge 文案猜、
  // Popular 排的 `interaction_count` 在服务端没有对应索引（`heat_count` 从不更新）。
  // 它们目前是占位交互，不值得为此先定一套 `sort=` 契约。
  const visibleCharacters = useMemo(() => {
    let items = characters;
    if (activeTab === "Trending") items = items.filter((character) => character.badges.some((badge) => badge.code.toLowerCase().includes("trend") || badge.display_name.toLowerCase().includes("trend")));
    if (activeTab === "Latest") items = items.filter((character) => character.badges.some((badge) => badge.code.toLowerCase().includes("new") || badge.display_name.toLowerCase().includes("new")));
    if (activeTab === "Popular") items = [...items].sort((a, b) => b.interaction_count - a.interaction_count);
    if (activeTab === "Following") items = [];
    return items;
  }, [activeTab, characters]);

  // 每次筛选条件变化都自增；回来的响应如果不是最新那一代就整条丢掉。去抖不能替代它——
  // 两个请求都发出去之后，谁先回来是网络说的，慢的那个先发、后到，就会把新结果盖回旧结果。
  const feedGeneration = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  // Limitless 是筛选行里的一个收窄条件，不是成人内容开关：开 = 只看 mature，关 = 不筛分级
  // （**不是**"藏起 mature"）。真要做 NSFW 开关，它属于账号设置、需要持久化，也不该长在这排
  // 一次性筛选按钮里。
  const ratingFilter: FeedRating | null = limitless ? "mature" : null;
  const genderFilter = GENDER_OPTIONS.find((option) => option.label === gender)?.value ?? null;

  const loadFirstPage = useCallback(async () => {
    const generation = ++feedGeneration.current;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const unfiltered = !query && selectedTags.length === 0 && !genderFilter && !ratingFilter;
    setLoading(true); setError(null); setPageError(null);
    try {
      const page = await getFeed(
        { q: query, tags: selectedTags, gender: genderFilter, rating: ratingFilter },
        { signal: controller.signal },
      );
      if (generation !== feedGeneration.current) return;
      setCharacters(page.items);
      setNextCursor(page.next_cursor);
      if (unfiltered) setTagVocabulary(Array.from(new Set(page.items.flatMap((character) => character.tags))).slice(0, TAG_VOCABULARY_MAX));
    } catch (loadError) {
      if (generation !== feedGeneration.current || controller.signal.aborted) return;
      setError(errorMessage(loadError, {
        offline: "Could not reach the character world. Check your connection and try again.",
        fallback: "Could not load characters just now. Try again in a moment.",
        byStatus: { 503: "Plum is not open yet. Please come back soon." },
      }));
    }
    finally { if (generation === feedGeneration.current) setLoading(false); }
  }, [genderFilter, query, ratingFilter, selectedTags]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const generation = feedGeneration.current;
    setLoadingMore(true); setPageError(null);
    try {
      const page = await getFeed({
        q: query, tags: selectedTags, gender: genderFilter, rating: ratingFilter, cursor: nextCursor,
      });
      // 翻页期间用户改了筛选：这一页属于旧条件，追加进去就是两套结果混在一起。
      if (generation !== feedGeneration.current) return;
      setCharacters((current) => {
        const seen = new Set(current.map((character) => character.id));
        return [...current, ...page.items.filter((character) => !seen.has(character.id))];
      });
      setNextCursor(page.next_cursor);
    } catch (pageLoadError) {
      if (generation !== feedGeneration.current) return;
      setPageError(errorMessage(pageLoadError, { fallback: "Could not load more characters." }));
    }
    finally { if (generation === feedGeneration.current) setLoadingMore(false); }
  }, [genderFilter, loadingMore, nextCursor, query, ratingFilter, selectedTags]);

  // 输入停下来才发请求；`query` 进依赖是为了让定时器落地后这个 effect 自己收敛。
  useEffect(() => {
    const term = searchText.trim();
    if (term === query) return;
    const timer = setTimeout(() => setQuery(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, query]);

  useEffect(() => { void loadFirstPage(); }, [loadFirstPage]);
  useEffect(() => () => inFlight.current?.abort(), []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  useEffect(() => {
    if (!context) return;
    if (context.actor.kind === "member") { setUser(context.actor.user); setBalance(context.wallet?.balance ?? 0); }
    else { setUser(null); setBalance(0); }
  }, [context]);
  useEffect(() => {
    const actor = context?.actor;
    if (!actor || actor.kind === "visitor" || !actor.profile || preferenceAppliedFor.current === actor.user.id) return;
    preferenceAppliedFor.current = actor.user.id;
    const preferred = preferenceToFeedGender(actor.profile.relationship_preference);
    setGender(GENDER_OPTIONS.find((option) => option.value === preferred)?.label ?? "All");
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
      if (openError instanceof ApiError && ["guest_profile_required", "audience_profile_required"].includes(openError.message)) {
        setPendingTarget(characterId); setWelcomeOpen(true); return;
      }
      if (openError instanceof ApiError && openError.message === "mature_content_not_allowed") {
        showMatureDenied(); return;
      }
      setError(errorMessage(openError, { fallback: "Could not start the chat. Please try again later." }));
    }
  }

  function showMatureDenied() {
    setToast(MATURE_CONTENT_NOT_ALLOWED_MESSAGE);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  function requestMature(action: "filter" | string) {
    const actor = context?.actor;
    if (!actor || actor.kind === "visitor" || !actor.profile_complete || !audienceProfile) {
      setPendingMatureAction(action);
      setWelcomeOpen(true);
      return;
    }
    if (!profileAllowsMature(audienceProfile)) {
      showMatureDenied();
      return;
    }
    if (action === "filter") setLimitless(true);
    else void enterCharacter(action);
  }

  function selectCharacter(character: FeedCharacter) {
    if (character.content_rating === "mature") requestMature(character.id);
    else void enterCharacter(character.id);
  }

  function completeWelcome(profile: GuestProfile) {
    setWelcomeOpen(false);
    const matureAction = pendingMatureAction;
    setPendingMatureAction(null);
    if (matureAction) {
      if (!profileAllowsMature(profile)) { showMatureDenied(); return; }
      if (matureAction === "filter") setLimitless(true);
      else void enterCharacter(matureAction);
      return;
    }
    const target = pendingTarget;
    setPendingTarget(null);
    if (target && target !== "create") void enterCharacter(target);
  }

  async function signOut() {
    try { await logout(); } catch { /* an expired session is already signed out */ }
    setUser(null); setBalance(0); setLimitless(false); setAccountOpen(false); void refresh();
  }

  function openCreate() {
    if (!user) { setPendingTarget("create"); setLoginOpen(true); return; }
    router.push("/create");
  }

  function afterAuthentication(authenticatedUser: AuthUser) {
    setUser(authenticatedUser); setLimitless(false); setLoginOpen(false);
    const target = pendingTarget; setPendingTarget(null);
    if (target === "create") router.push("/create");
    else if (target) void enterCharacter(target);
  }

  function clearFilters() { setLimitless(false); setGender("All"); setSelectedTags([]); setSearchText(""); setQuery(""); }

  function toggleTag(tag: string) {
    setSelectedTags((current) => {
      if (current.includes(tag)) return current.filter((item) => item !== tag);
      // 服务端超过 FEED_TAGS_MAX 个直接 400；这里就不让用户点出那次失败。
      return current.length >= FEED_TAGS_MAX ? current : [...current, tag];
    });
  }

  return <main className="character-feed-shell">
    <header className="site-header">
      <div className="header-brand-group"><Brand /><CommunityLink /></div>
      <div className="site-header-actions">
        <button className="header-circle" aria-label={HEADER_LABELS.search} aria-expanded={searchOpen} onClick={() => setSearchOpen((value) => !value)}><SearchIcon /></button>
        <button className="header-circle" aria-label={HEADER_LABELS.create} title={HEADER_LABELS.create} onClick={openCreate}><CreateIcon /></button>
        <div className="header-menu-wrap">
          <button className="header-circle language-symbol" aria-label={HEADER_LABELS.language} aria-expanded={languageOpen} onClick={() => setLanguageOpen((value) => !value)}><TranslationIcon /></button>
          {languageOpen && <div className="header-dropdown language-menu"><button className="selected">{LANGUAGE_MENU.english} <span>✓</span></button><button>{LANGUAGE_MENU.chinese}</button><small>{LANGUAGE_MENU.note}</small></div>}
        </div>
        {user && <div className="header-menu-wrap"><button className="coin-button" onClick={() => setWalletOpen((value) => !value)} aria-label={HEADER_LABELS.coinBalance(formatCoins(balance))}><span>✦</span><strong>{formatCoins(balance)}</strong></button>
          {walletOpen && <div className="header-dropdown wallet-panel"><small>{WALLET_PANEL.balance}</small><strong>{formatCoins(balance)}</strong><h3>{WALLET_PANEL.history}</h3><p>{WALLET_PANEL.empty}</p><button disabled>{WALLET_PANEL.topUp}</button></div>}
        </div>}
        {user ? <AccountDropdown user={user} open={accountOpen} onToggle={() => setAccountOpen((value) => !value)} onSignOut={() => void signOut()} /> : <button className="header-circle" aria-label={HEADER_LABELS.signIn} onClick={() => setLoginOpen(true)}><LoginIcon /></button>}
      </div>
      {searchOpen && <div className="enhanced-search"><SearchIcon /><input autoFocus value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search characters, settings, or tags" /><button onClick={() => { setSearchText(""); setSearchOpen(false); }} aria-label="Close search"><CloseIcon /></button><div><small>Trending searches</small>{HOT_SEARCHES.map((term) => <button key={term} onClick={() => setSearchText(term)}>{term}</button>)}</div></div>}
    </header>

    <section className="feed-content">
      <div className="feed-controls">
        <nav className="feed-tabs" aria-label="Discover categories">{MAIN_TABS.map((label) => <button className={activeTab === label ? "active" : ""} key={label} onClick={() => setActiveTab(label)}>{label}</button>)}</nav>
        <div className="feed-filters">
          <button className={`limitless-switch${limitless ? " active" : ""}`} aria-pressed={limitless} onClick={() => limitless ? setLimitless(false) : requestMature("filter")}><span>Limitless</span><i /></button>
          <div className="gender-menu-wrap">
            <button className="gender-filter" aria-label="Character gender" aria-expanded={genderOpen} onClick={() => setGenderOpen((value) => !value)}><span>{gender}</span><i>⌄</i></button>
            {genderOpen && <div className="gender-menu">{GENDER_OPTIONS.map(({ label }) => <button className={gender === label ? "selected" : ""} key={label} onClick={() => { setGender(label); setGenderOpen(false); }}><span>{label}</span>{gender === label && <i>✓</i>}</button>)}</div>}
          </div>
          <div className="tag-filter-wrap">
            <button className={`filter-button${selectedTags.length ? " active" : ""}`} aria-label="Filter by tag" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}><FilterIcon /></button>
            {filtersOpen && <div className="tag-filter-panel"><header><strong>Filter by tag</strong><button onClick={() => setFiltersOpen(false)} aria-label="Close tag filters"><CloseIcon /></button></header><div>{availableTags.map((tag) => <button className={selectedTags.includes(tag) ? "active" : ""} key={tag} disabled={!selectedTags.includes(tag) && selectedTags.length >= FEED_TAGS_MAX} onClick={() => toggleTag(tag)}>{tag}</button>)}</div><small>{selectedTags.length >= FEED_TAGS_MAX ? `Up to ${FEED_TAGS_MAX} tags at a time.` : "A fuller tag library is coming."}</small></div>}
          </div>
        </div>
      </div>
      {error && <div className="error-banner"><span>{error}</span><button onClick={() => void loadFirstPage()}>Reload</button></div>}
      {loading ? <LoadingState /> : visibleCharacters.length === 0 ? <div className="feed-empty"><strong>No characters match these filters</strong><button onClick={clearFilters}>Clear filters</button></div> : <><div className="character-grid">{visibleCharacters.map((character, index) => <article className="character-card" key={character.id}>
        <button className="card-hit-area" onClick={() => selectCharacter(character)} disabled={openingId !== null} aria-label={`Start chatting with ${character.display_name}`}>
          <Image className="character-card-cover" src={character.cover_ref ?? "/characters/kai.svg"} alt={character.display_name} fill priority={index < 6} sizes="(max-width: 560px) 50vw, (max-width: 900px) 33vw, 20vw" />
          <span className="card-darken" />
          {openingId === character.id && <span className="opening-card">Entering story…</span>}
          <span className="card-copy"><strong>{character.display_name}</strong><span className="card-meta-row"><span className="chat-count"><MessageIcon />{formatCompactCount(character.interaction_count)}</span>{character.tags.slice(0, 3).map((tag, tagIndex) => <span className={`character-tag${tagIndex === 2 ? " character-tag-tertiary" : ""}`} key={tag}>{tag}</span>)}</span><span className="card-tagline">{character.tagline}</span></span>
          <span className="card-hover-detail"><i className="hover-avatar"><Image src={character.avatar_ref ?? character.cover_ref ?? "/characters/kai.svg"} alt="" fill sizes="52px" /></i><span>{character.intro || character.tagline}</span><b><MessageIcon />Chat Now</b></span>
        </button>
      </article>)}</div>
      {pageError && <p className={styles.loadMoreError}><span>{pageError}</span><button onClick={() => void loadMore()}>Retry</button></p>}
      {nextCursor && <div className={styles.loadMore}><button onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more characters"}</button></div>}
      </>}
    </section>
    <footer className="reference-footer"><a>Privacy Policy</a><a>Terms of Service</a><a>Community Guidelines</a><a>About Us</a><CommunityLink className="footer-community-link" label="Contact & Support" /><small>© 2026 PLUM. All rights reserved.</small></footer>
    {loginOpen && <EmailSignInDialog returnTo={pendingTarget === "create" ? "/create" : undefined} onAuthenticated={afterAuthentication} onClose={() => { setLoginOpen(false); setPendingTarget(null); }} />}
    {welcomeOpen && <WelcomeDialog onComplete={completeWelcome} onClose={() => { setWelcomeOpen(false); setPendingTarget(null); setPendingMatureAction(null); }} />}
    {toast && <div className="audience-toast" role="status" aria-live="polite">{toast}</div>}
  </main>;
}

export default function FeedPage() {
  return <FeedContent />;
}
