"use client";

import { createContext, FormEvent, ReactNode, useContext, useEffect, useState } from "react";
import { ApiError, createGuestSession, getAuthContext, requestEmailChallenge, updateGuestProfile, verifyEmailChallenge } from "@/lib/api";
import type { AuthContext, AuthUser, GuestProfile } from "@/lib/types";

type AuthState = AuthContext | null;
type PlumAuthValue = {
  context: AuthState;
  loading: boolean;
  refresh: () => Promise<AuthContext>;
  ensureGuest: () => Promise<AuthContext>;
  saveWelcome: (profile: GuestProfile) => Promise<AuthContext>;
};

const PlumAuthContext = createContext<PlumAuthValue | null>(null);

export function PlumAuthProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<AuthState>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const next = await getAuthContext();
    setContext(next);
    return next;
  }

  useEffect(() => {
    void refresh().catch(() => setContext(null)).finally(() => setLoading(false));
  }, []);

  async function ensureGuest() {
    const current = context ?? await refresh();
    if (current.actor.kind !== "visitor") return current;
    const next = await createGuestSession();
    setContext(next);
    return next;
  }

  async function saveWelcome(profile: GuestProfile) {
    await ensureGuest();
    const next = await updateGuestProfile({ ...profile, adult_confirmed: true });
    setContext(next);
    return next;
  }

  return <PlumAuthContext.Provider value={{ context, loading, refresh, ensureGuest, saveWelcome }}>{children}</PlumAuthContext.Provider>;
}

export function usePlumAuth() {
  const value = useContext(PlumAuthContext);
  if (!value) throw new Error("usePlumAuth must be used inside PlumAuthProvider");
  return value;
}

function apiMessage(error: unknown) {
  if (!(error instanceof ApiError)) return "暂时无法连接服务，请稍后再试。";
  const messages: Record<string, string> = {
    email_provider_unavailable: "邮件服务暂不可用，请稍后再试。",
    email_challenge_too_frequent: "发送太频繁，请稍后再试。",
    email_auth_not_configured: "邮箱登录暂未配置，请稍后再试。",
    email_auth_disabled: "邮箱登录暂未开放。",
    too_many_login_attempts: "尝试过于频繁，请稍后再试。",
    origin_required: "请使用正常浏览器页面继续。",
    guest_chat_disabled: "游客体验暂未开放。",
    guest_session_required: "登录状态已失效，请刷新页面后重试。",
    email_code_invalid: "验证码不正确，请重新输入。",
    email_challenge_expired: "验证码已过期，请重新获取。",
    email_challenge_attempts_exceeded: "错误次数过多，请重新获取验证码。",
    email_challenge_invalid: "验证码已失效，请重新获取。",
    email_challenge_consumed: "该验证码已使用，请重新获取。",
    email_challenge_actor_mismatch: "登录环境已变化，请重新获取验证码。",
    identity_target_disabled: "该账号当前不可用，请联系客服。",
    identity_merge_conflict: "账号合并出现冲突，请联系客服。",
  };
  return messages[error.message] ?? "操作未完成，请检查输入后重试。";
}

export function WelcomeDialog({ onComplete, onClose }: { onComplete: () => void; onClose: () => void }) {
  const { saveWelcome } = usePlumAuth();
  const [pronouns, setPronouns] = useState<GuestProfile["pronouns"]>("they_them");
  const [relationshipPreference, setRelationshipPreference] = useState<NonNullable<GuestProfile["relationship_preference"]>>("no_preference");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!adultConfirmed || submitting) return;
    setSubmitting(true); setError(null);
    try {
      await saveWelcome({ pronouns, relationship_preference: relationshipPreference, genres: [] });
      onComplete();
    } catch (err) { setError(apiMessage(err)); } finally { setSubmitting(false); }
  }

  return <div className="access-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onClick={onClose}>
    <form className="access-card" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <button type="button" className="dialog-close" onClick={onClose} aria-label="关闭"><span>×</span></button>
      <span className="access-kicker">WELCOME TO PLUM</span><h1 id="welcome-title">先认识一下你</h1>
      <p>可先免费体验聊天；注册后可保存进度并获得 1000 金币。</p>
      <label><span>你希望如何被称呼</span><select value={pronouns} onChange={(event) => setPronouns(event.target.value as GuestProfile["pronouns"])}><option value="she_her">她 / 她</option><option value="he_him">他 / 他</option><option value="they_them">TA / TA</option><option value="other">其他</option></select></label>
      <label><span>感兴趣的角色</span><select value={relationshipPreference} onChange={(event) => setRelationshipPreference(event.target.value as NonNullable<GuestProfile["relationship_preference"]>)}><option value="no_preference">都可以</option><option value="male">男性角色</option><option value="female">女性角色</option><option value="all">全部</option></select></label>
      <label className="consent"><input type="checkbox" checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.target.checked)} /><span>我已年满 18 周岁，并同意体验成人向剧情内容。</span></label>
      {error && <div className="access-error">{error}</div>}
      <button className="access-submit" disabled={submitting || !adultConfirmed}>{submitting ? "正在准备…" : "开始免费体验"}</button>
      <button type="button" className="text-action" onClick={onClose}>暂不体验</button>
    </form>
  </div>;
}

// A freshly issued guest cookie can lag behind a synchronous top-level
// navigation, so the OAuth start endpoint races the Set-Cookie and rejects with
// guest_session_required. Wait until the non-HttpOnly `plum_csrf` sibling (set in
// the same response as the guest session cookie) is observable before navigating.
function waitForGuestCookie(timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const ready = () => document.cookie.split("; ").some((item) => item.startsWith("plum_csrf="));
    const tick = () => (ready() || Date.now() > deadline ? resolve() : requestAnimationFrame(tick));
    tick();
  });
}

export function EmailSignInDialog({ onAuthenticated, onClose, returnTo }: { onAuthenticated: (user: AuthUser) => void; onClose: () => void; returnTo?: string }) {
  const { ensureGuest, refresh, context } = usePlumAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  // 后端按邮箱限制重发间隔，倒计时归零前不放开「重新发送」。
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function sendCode() {
    await ensureGuest();
    const result = await requestEmailChallenge(email.trim());
    setChallengeId(result.challenge_id);
    setResendIn(Math.max(1, result.retry_after_seconds));
  }

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true); setError(null);
    try {
      await sendCode();
    } catch (err) { setError(apiMessage(err)); } finally { setSubmitting(false); }
  }

  async function resendCode() {
    if (submitting || resendIn > 0) return;
    setSubmitting(true); setError(null);
    try {
      await sendCode();
      setCode("");
    } catch (err) { setError(apiMessage(err)); } finally { setSubmitting(false); }
  }

  async function continueWithGoogle() {
    if (submitting) return;
    setSubmitting(true); setError(null);
    try {
      await ensureGuest();
      await waitForGuestCookie();
      const destination = returnTo ?? (window.location.pathname + window.location.search);
      window.location.assign(`/api/v1/products/plum/auth/oauth/google/start?return_to=${encodeURIComponent(destination)}`);
    } catch (err) { setError(apiMessage(err)); setSubmitting(false); }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!challengeId || !/^\d{6}$/.test(code) || submitting) return;
    setSubmitting(true); setError(null);
    try {
      const result = await verifyEmailChallenge(challengeId, code, name);
      await refresh();
      onAuthenticated(result.actor.user);
    } catch (err) { setError(apiMessage(err)); } finally { setSubmitting(false); }
  }

  return <div className="access-overlay" role="dialog" aria-modal="true" aria-labelledby="email-title" onClick={onClose}>
    <form className="access-card" onSubmit={challengeId ? verifyCode : requestCode} onClick={(event) => event.stopPropagation()}>
      <button type="button" className="dialog-close" onClick={onClose} aria-label="关闭"><span>×</span></button>
      <span className="access-kicker">ACCOUNT</span><h1 id="email-title">{challengeId ? "输入验证码" : "登录或注册"}</h1>
      <p>{challengeId ? `验证码已发送至 ${email}` : "使用邮箱登录。首次验证会自动创建账号，并保留你的游客进度。"}</p>
      {!challengeId && <><label><span>邮箱</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required /></label><label><span>称呼（首次注册可选）</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} autoComplete="nickname" placeholder="例如：Alice" /></label></>}
      {challengeId && <label><span>6 位验证码</span><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" autoFocus /></label>}
      {error && <div className="access-error">{error}</div>}
      {!challengeId && context?.capabilities.google_auth && <button type="button" className="text-action" onClick={() => void continueWithGoogle()} disabled={submitting}>Continue with Google</button>}
      <button className="access-submit" disabled={submitting || (!challengeId ? !email.trim() : code.length !== 6)}>{submitting ? "请稍候…" : challengeId ? "确认登录" : "发送验证码"}</button>
      {challengeId && <button type="button" className="text-action" onClick={() => void resendCode()} disabled={submitting || resendIn > 0}>{resendIn > 0 ? `重新发送（${resendIn}s）` : "重新发送验证码"}</button>}
      {challengeId && <button type="button" className="text-action" onClick={() => { setChallengeId(null); setCode(""); setResendIn(0); }}>换一个邮箱</button>}
    </form>
  </div>;
}
