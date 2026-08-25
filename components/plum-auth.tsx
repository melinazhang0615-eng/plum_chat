"use client";

import { createContext, FormEvent, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { createGuestSession, getAuthContext, requestEmailChallenge, submitClientTimezone, updateGuestProfile, verifyEmailChallenge } from "@/lib/api";
import { errorMessage } from "@/lib/error-messages";
import { detectClientTimezone, timezoneNeedsSubmit } from "@/lib/timezone";
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
  const timezoneSent = useRef(false);

  async function refresh() {
    const next = await getAuthContext();
    setContext(next);
    return next;
  }

  useEffect(() => {
    void refresh().catch(() => setContext(null)).finally(() => setLoading(false));
  }, []);

  /**
   * Tell the server which timezone this browser is in. It is the only source of that fact
   * (see lib/timezone.ts), and the daily memory job needs it to cut days on the reader's own
   * midnight rather than UTC's.
   *
   * Runs off `context` rather than inside `refresh` so every path that installs an actor —
   * initial load, guest creation, sign-in — is covered by one place. At most one attempt per
   * page load: a failure here only costs a UTC fallback, and retrying it would be a request
   * per render for a value nothing on screen depends on.
   */
  useEffect(() => {
    if (!context || context.actor.kind === "visitor" || timezoneSent.current) return;
    const detected = detectClientTimezone();
    if (!timezoneNeedsSubmit(context.language, detected)) return;
    timezoneSent.current = true;
    void submitClientTimezone(detected)
      .then((result) => setContext((prev) => (prev?.language
        ? { ...prev, language: { ...prev.language, timezone: result.preference.timezone, timezone_source: result.preference.source } }
        : prev)))
      .catch(() => undefined);
  }, [context]);

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
  return errorMessage(error, {
    offline: "Cannot reach Plum right now. Check your connection and try again.",
    fallback: "That did not go through. Check your details and try again.",
  });
}

const WELCOME_PRONOUNS: { value: GuestProfile["pronouns"]; label: string; mark: string }[] = [
  { value: "she_her", label: "She/Her", mark: "♀" },
  { value: "he_him", label: "He/Him", mark: "♂" },
  { value: "they_them", label: "They/Them", mark: "✳" },
];
const WELCOME_AGE_BANDS = ["Above 26", "24-26", "21-23", "18-20", "14-17", "0-13"] as const;
const WELCOME_PREFERENCES: { value: NonNullable<GuestProfile["relationship_preference"]>; label: string; emoji: string }[] = [
  { value: "male", label: "Male", emoji: "👨" },
  { value: "female", label: "Female", emoji: "👩" },
  { value: "all", label: "Non-binary", emoji: "🌈" },
];

export function WelcomeDialog({ onComplete, onClose }: { onComplete: () => void; onClose: () => void }) {
  const { saveWelcome } = usePlumAuth();
  const [pronouns, setPronouns] = useState<GuestProfile["pronouns"] | null>(null);
  const [ageBand, setAgeBand] = useState<string | null>(null);
  const [relationshipPreference, setRelationshipPreference] = useState<GuestProfile["relationship_preference"]>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(pronouns && ageBand);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !pronouns || submitting) return;
    setSubmitting(true); setError(null);
    try {
      // "Enter Plum Now!" grants the 18+ consent stated in the subtitle (saveWelcome sends adult_confirmed).
      // ageBand is captured for personalization/age-gating but the guest profile has no field for it yet
      // — TODO(backend): add an age band to GuestProfile so the collected value can be persisted.
      await saveWelcome({ pronouns, relationship_preference: relationshipPreference, genres: [] });
      onComplete();
    } catch (err) { setError(apiMessage(err)); } finally { setSubmitting(false); }
  }

  return <div className="welcome-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onClick={onClose}>
    <form className="welcome-card" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <button type="button" className="welcome-close" onClick={onClose} aria-label="Close">×</button>
      <h1 id="welcome-title"><em>Hi,</em> Welcome to Plum</h1>
      <p className="welcome-sub">Tell us more for a better personalized experience. Some content may not be suitable for users of all ages.</p>

      <div className="welcome-field">
        <span>Which pronoun do you use? <i>✳</i></span>
        <div className="pronoun-row">
          {WELCOME_PRONOUNS.map((item) => (
            <button type="button" key={item.value} className={`pronoun-option${pronouns === item.value ? " active" : ""}`} onClick={() => setPronouns(item.value)}>
              <span className="pronoun-circle">{item.mark}</span><b>{item.label}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="welcome-field">
        <span>What&apos;s your age? <i>✳</i></span>
        <div className="welcome-grid">
          {WELCOME_AGE_BANDS.map((band) => (
            <button type="button" key={band} className={ageBand === band ? "active" : ""} onClick={() => setAgeBand(band)}>{band}</button>
          ))}
        </div>
      </div>

      <div className="welcome-field">
        <span>What&apos;s your relationship preference?</span>
        <div className="welcome-grid">
          {WELCOME_PREFERENCES.map((pref) => (
            <button type="button" key={pref.value} className={relationshipPreference === pref.value ? "active" : ""} onClick={() => setRelationshipPreference(pref.value)}>{pref.emoji} {pref.label}</button>
          ))}
        </div>
      </div>

      {error && <div className="access-error">{error}</div>}
      <button className="welcome-enter" disabled={!ready || submitting}>{submitting ? "Entering…" : "Enter Plum Now!"}</button>
      <button type="button" className="welcome-skip" onClick={onClose}>Not now</button>
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
      <button type="button" className="dialog-close" onClick={onClose} aria-label="Close"><span>×</span></button>
      <span className="access-kicker">ACCOUNT</span><h1 id="email-title">{challengeId ? "Enter your code" : "Sign in or sign up"}</h1>
      <p>{challengeId ? `We sent a code to ${email}` : "Sign in with your email. First time here, we create your account and keep the progress you made as a guest."}</p>
      {!challengeId && <><label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required /></label><label><span>Name (optional)</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} autoComplete="nickname" placeholder="e.g. Alice" /></label></>}
      {challengeId && <label><span>6-digit code</span><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" autoFocus /></label>}
      {error && <div className="access-error">{error}</div>}
      {!challengeId && context?.capabilities.google_auth && <button type="button" className="text-action" onClick={() => void continueWithGoogle()} disabled={submitting}>Continue with Google</button>}
      <button className="access-submit" disabled={submitting || (!challengeId ? !email.trim() : code.length !== 6)}>{submitting ? "One moment…" : challengeId ? "Confirm sign-in" : "Send code"}</button>
      {challengeId && <button type="button" className="text-action" onClick={() => void resendCode()} disabled={submitting || resendIn > 0}>{resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}</button>}
      {challengeId && <button type="button" className="text-action" onClick={() => { setChallengeId(null); setCode(""); setResendIn(0); }}>Use a different email</button>}
    </form>
  </div>;
}
