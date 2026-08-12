"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { ApiError, createConversation, getBootstrap, getFeed, logout, redeemAccessCode } from "@/lib/api";
import { formatCompactCount } from "@/lib/format";
import type { AuthUser, FeedCharacter } from "@/lib/types";
import { WelcomeModal, SignInCard, SignInReward } from "@/components/onboarding";
import { SIGNIN_REWARD_COINS, clearPendingReward, getGuestProfile, getMockAuth, getUserName, hasPendingReward, mockSignOut, recordCharacterView, resetGuestState } from "@/lib/guest";

const MAIN_TABS = ["For You", "Trending", "Latest", "Popular", "Following"] as const;
const HOT_SEARCHES = ["Slow burn", "Enemies to lovers", "Fantasy", "Protective", "After hours"];

function SearchIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.3 4.3" /></svg>; }
function CreateIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>; }
function FilterIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M8 12h8M10.5 17h3" /></svg>; }
function MessageIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z" /></svg>; }
function LoginIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.8-4 2.9-6 6.5-6s5.7 2 6.5 6" /></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>; }
function TranslationIcon() { return <svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M550.761 343.763l1.717 3.313 122.97 281.118a26.353 26.353 0 0 1-46.772 24.064l-1.506-2.952-31.533-72.071H461.011l-31.503 72.071a26.353 26.353 0 0 1-49.423-18.01l1.114-3.102 123-281.118a26.383 26.383 0 0 1 46.562-3.313zm-22.407 79.601-44.273 101.165h88.516l-44.273-101.165z" /><path d="M521.306 120.471a377.826 377.826 0 0 1 370.146 302.2 26.353 26.353 0 1 1-51.621 10.481 325.12 325.12 0 0 0-623.195-48.489l-.903 2.56 58.307-19.426a26.353 26.353 0 0 1 32.106 13.583l1.204 3.072a26.353 26.353 0 0 1-13.552 32.106l-3.103 1.204-105.411 35.147a26.353 26.353 0 0 1-34.154-30.238 377.826 377.826 0 0 1 370.146-302.2zm334.878 423.393a26.353 26.353 0 0 1 35.298 29.847 377.826 377.826 0 0 1-740.352 0 26.353 26.353 0 0 1 51.652-10.481 325.12 325.12 0 0 0 620.213 56.23l2.891-7.469-42.134 16.203a26.353 26.353 0 0 1-32.678-12.107l-1.385-3.012a26.353 26.353 0 0 1 12.137-32.678l3.012-1.385 91.346-35.148z" /></svg>; }
function CommunityIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.3" /><path d="M3.5 19c.7-3.5 2.5-5.2 5.5-5.2s4.8 1.7 5.5 5.2M14.2 14.5c2.9-.7 5 .8 6.3 3.6" /></svg>; }

function LoadingState() {
  return <div className="feed-loading" aria-label="Loading characters"><i /><span>Loading characters…</span></div>;
}

function AccessDialog({ onAuthenticated, onClose }: { onAuthenticated: (user: AuthUser) => void; onClose: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!displayName.trim() || !accessCode.trim() || submitting) return;
    setSubmitting(true); setError(null);
    try {
      const result = await redeemAccessCode(accessCode.trim(), displayName.trim());
      onAuthenticated(result.user);
    } catch (loginError) {
      setError(loginError instanceof ApiError && loginError.message === "invalid_access_code" ? "Invite code is invalid or expired. Please contact the test lead." : "Unable to sign in right now. Please try again later.");
    } finally { setSubmitting(false); }
  }

  return <div className="access-overlay" role="dialog" aria-modal="true" aria-labelledby="access-title" onClick={onClose}>
    <form className="access-card" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <button type="button" className="dialog-close" onClick={onClose} aria-label="Close sign in"><CloseIcon /></button>
      <Brand /><span className="access-kicker">PRIVATE BETA</span><h1 id="access-title">Enter Plum Chat</h1>
      <p>Sign in to chat, save characters, and use your own coin balance.</p>
      <label><span>Your name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} autoComplete="nickname" placeholder="e.g. Alice" /></label>
      <label><span>Invite code</span><input value={accessCode} onChange={(event) => setAccessCode(event.target.value)} maxLength={160} autoComplete="one-time-code" placeholder="plum_…" /></label>
      {error && <div className="access-error">{error}</div>}
      <button className="access-submit" disabled={submitting || !displayName.trim() || !accessCode.trim()}>{submitting ? "Entering…" : "Enter Plum Chat"}</button>
      <small>An invite code binds to a single test account — please don’t share it.</small>
    </form>
  </div>;
}

export default function FeedPage() {
  const router = useRouter();
  const [characters, setCharacters] = useState<FeedCharacter[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
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
  // Guest onboarding prototype: mock auth + first-visit welcome (client-only state)
  const [mockAuthed, setMockAuthed] = useState(true); // assume signed-in until mount to avoid SSR flash
  const [showWelcome, setShowWelcome] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [showReward, setShowReward] = useState(false);

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
      try {
        const bootstrap = await getBootstrap();
        setBalance(bootstrap.wallet.balance); setUser(bootstrap.user);
      } catch (authError) {
        if (!(authError instanceof ApiError && authError.status === 401)) throw authError;
        setUser(null); setBalance(0);
      }
    } catch (loadError) {
      setError(
        loadError instanceof ApiError && loadError.status === 503
          ? "Plum Chat is not open yet. Please come back later."
          : "Could not reach the character world. Please make sure the local backend is running.",
      );
    }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("guest") === "reset") { resetGuestState(); window.history.replaceState(null, "", "/"); }
    if (query.get("login") === "1") setLoginOpen(true);
    if (query.get("search") === "1") setSearchOpen(true);
    const authed = Boolean(getMockAuth());
    setMockAuthed(authed);
    if (!authed && !getGuestProfile()) setShowWelcome(true);
    if (hasPendingReward()) setShowReward(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "plum_mock_auth") setMockAuthed(Boolean(getMockAuth()));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function enterCharacter(characterId: string) {
    if (openingId) return;
    recordCharacterView(characterId); // browse-first taste signal (no UI)
    setOpeningId(characterId); setError(null);
    try {
      const result = await createConversation(characterId);
      router.push(`/chat/${characterId}?conversation=${result.conversation.id}`);
    } catch (openError) {
      setOpeningId(null);
      if (openError instanceof ApiError && openError.status === 401) { setPendingTarget(characterId); setLoginOpen(true); return; }
      setError("Could not start the chat. Please try again later.");
    }
  }

  async function signOut() {
    try { await logout(); } catch { /* an expired session is already signed out */ }
    mockSignOut(); setMockAuthed(false);
    setUser(null); setBalance(0); setAccountOpen(false);
  }

  function openCreate() {
    if (!user) { setPendingTarget("create"); setLoginOpen(true); return; }
    router.push("/create/v1");
  }

  function afterAuthentication(authenticatedUser: AuthUser) {
    setUser(authenticatedUser); setLoginOpen(false);
    void getBootstrap()
      .then((bootstrap) => setBalance(bootstrap.wallet.balance))
      .catch(() => setBalance(0));
    const target = pendingTarget; setPendingTarget(null);
    if (target === "create") router.push("/create/v1");
    else if (target) void enterCharacter(target);
  }

  function clearFilters() { setLimitless(false); setGender("All"); setSelectedTags([]); }

  return <main className="tipsy-feed-shell">
    <header className="tipsy-header">
      <div className="header-brand-group"><Brand /><Link className="community-link" href="/community"><CommunityIcon /><span>Community</span></Link></div>
      <div className="tipsy-header-right">
        <button className="header-circle" aria-label="Search" aria-expanded={searchOpen} onClick={() => setSearchOpen((value) => !value)}><SearchIcon /></button>
        <button className="header-circle" aria-label="Create" title="Create" onClick={openCreate}><CreateIcon /></button>
        <div className="header-menu-wrap">
          <button className="header-circle language-symbol" aria-label="Switch language" aria-expanded={languageOpen} onClick={() => setLanguageOpen((value) => !value)}><TranslationIcon /></button>
          {languageOpen && <div className="header-dropdown language-menu"><button className="selected">简体中文 <span>✓</span></button><button>English</button><small>More languages coming soon</small></div>}
        </div>
        {user && mockAuthed && <div className="header-menu-wrap"><button className="coin-button" onClick={() => setWalletOpen((value) => !value)} aria-label={`Coin balance ${balance}`}><span>✦</span><strong>{balance.toLocaleString("en-US")}</strong></button>
          {walletOpen && <div className="header-dropdown wallet-panel"><small>Coin balance</small><strong>{balance.toLocaleString("en-US")}</strong><h3>Transaction history</h3><p>No transactions yet</p><button disabled>Top-up · coming soon</button></div>}
        </div>}
        {user && mockAuthed ? <div className="header-menu-wrap"><button className="account-button" onClick={() => setAccountOpen((value) => !value)} aria-label="Account settings"><i>{(getUserName() ?? user.display_name).slice(0, 1).toUpperCase()}</i><span>{getUserName() ?? user.display_name}</span><b>⌄</b></button>
          {accountOpen && <div className="header-dropdown account-menu"><button disabled>Account settings · coming soon</button><button onClick={() => void signOut()}>Sign out</button></div>}
        </div> : <button className="feed-signin-button" onClick={() => setSignInOpen(true)}>Sign in</button>}
      </div>
      {searchOpen && <div className="enhanced-search"><SearchIcon /><input autoFocus value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search characters, settings or tags" /><button onClick={() => { setSearchText(""); setSearchOpen(false); }} aria-label="Close search"><CloseIcon /></button><div><small>Trending searches</small>{HOT_SEARCHES.map((term) => <button key={term} onClick={() => setSearchText(term)}>{term}</button>)}</div></div>}
    </header>

    <section className="feed-content">
      <div className="feed-controls">
        <nav className="feed-tabs" aria-label="Discover categories">{MAIN_TABS.map((label) => <button className={activeTab === label ? "active" : ""} key={label} onClick={() => setActiveTab(label)}>{label}</button>)}</nav>
        <div className="feed-filters">
          <button className={`limitless-switch${limitless ? " active" : ""}`} aria-pressed={limitless} onClick={() => setLimitless((value) => !value)}><span>Limitless</span><i /></button>
          <div className="gender-menu-wrap">
            <button className="gender-filter" aria-label="Character gender" aria-expanded={genderOpen} onClick={() => setGenderOpen((value) => !value)}><span>{gender}</span><i>⌄</i></button>
            {genderOpen && <div className="gender-menu">{["All", "Female", "Male", "Other"].map((option) => <button className={gender === option ? "selected" : ""} key={option} onClick={() => { setGender(option); setGenderOpen(false); }}><span>{option}</span>{gender === option && <i>✓</i>}</button>)}</div>}
          </div>
          <div className="tag-filter-wrap">
            <button className={`filter-button${selectedTags.length ? " active" : ""}`} aria-label="Filter tags" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}><FilterIcon /></button>
            {filtersOpen && <div className="tag-filter-panel"><header><strong>Filter tags</strong><button onClick={() => setFiltersOpen(false)} aria-label="Close tag filter"><CloseIcon /></button></header><div>{availableTags.map((tag) => <button className={selectedTags.includes(tag) ? "active" : ""} key={tag} onClick={() => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])}>{tag}</button>)}</div><small>Tag curation ships in a later version.</small></div>}
          </div>
        </div>
      </div>
      {error && <div className="error-banner"><span>{error}</span><button onClick={() => void load()}>Reload</button></div>}
      {loading ? <LoadingState /> : visibleCharacters.length === 0 ? <div className="feed-empty"><strong>No characters match your filters</strong><button onClick={clearFilters}>Clear filters</button></div> : <div className="tipsy-grid">{visibleCharacters.map((character, index) => <article className="tipsy-card" key={character.id}>
        <button className="card-hit-area" onClick={() => void enterCharacter(character.id)} disabled={openingId !== null} aria-label={`Chat with ${character.display_name}`}>
          <Image className="tipsy-card-cover" src={character.cover_ref ?? "/characters/kai.svg"} alt={character.display_name} fill priority={index < 6} sizes="(max-width: 560px) 50vw, (max-width: 900px) 33vw, 20vw" />
          <span className="card-darken" />
          {openingId === character.id && <span className="opening-card">Entering story…</span>}
          <span className="card-copy"><strong>{character.display_name}</strong><span className="card-meta-row"><span className="chat-count"><MessageIcon />{formatCompactCount(character.interaction_count)}</span>{character.tags.slice(0, 3).map((tag, tagIndex) => <span className={`character-tag${tagIndex === 2 ? " character-tag-tertiary" : ""}`} key={tag}>{tag}</span>)}</span><span className="card-tagline">{character.tagline}</span></span>
          <span className="card-hover-detail"><i className="hover-avatar"><Image src={character.avatar_ref ?? character.cover_ref ?? "/characters/kai.svg"} alt="" fill sizes="52px" /></i><span>{character.intro || character.tagline}</span><b><MessageIcon />Chat Now</b></span>
        </button>
      </article>)}</div>}
    </section>
    <footer className="reference-footer"><a>Privacy Policy</a><a>Terms of Service</a><a>Community Guidelines</a><a>About Us</a><small>© 2026 PLUM. All rights reserved.</small></footer>
    {loginOpen && <AccessDialog onAuthenticated={afterAuthentication} onClose={() => { setLoginOpen(false); setPendingTarget(null); }} />}
    {showWelcome && <WelcomeModal onDone={() => setShowWelcome(false)} />}
    {signInOpen && !showWelcome && (
      <div className="signin-overlay" role="dialog" aria-modal="true" onClick={() => setSignInOpen(false)}>
        <div onClick={(event) => event.stopPropagation()}>
          <SignInCard heading="Sign in to Plum" subheading="Fun, interactive characters to keep you company — save your stories, favorites and coins across devices." onSignedIn={() => { setSignInOpen(false); setMockAuthed(true); if (hasPendingReward()) setShowReward(true); }} />
        </div>
      </div>
    )}
    {showReward && <SignInReward coins={SIGNIN_REWARD_COINS} onClaim={() => { clearPendingReward(); setShowReward(false); }} />}
  </main>;
}
