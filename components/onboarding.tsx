"use client";

// Guest onboarding prototype UI: first-visit Welcome modal + mock sign-in card.
// All copy is English per product language rules; state lives in lib/guest.ts.

import { useState } from "react";
import { saveGuestProfile, mockSignIn, type GuestProfile, type MockAuth } from "@/lib/guest";

const AGE_BANDS: GuestProfile["ageBand"][] = ["Above 26", "24-26", "21-23", "18-20", "14-17", "0-13"];
const PREFERENCES = [
  { value: "Male" as const, emoji: "👨" },
  { value: "Female" as const, emoji: "👩" },
  { value: "Non-binary" as const, emoji: "🌈" },
];
const PRONOUNS: { value: NonNullable<GuestProfile["pronoun"]>; mark: string }[] = [
  { value: "She/Her", mark: "♀" },
  { value: "He/Him", mark: "♂" },
  { value: "They/Them", mark: "✳" },
];

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.1 3.57-5.18 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.27a12 12 0 0 0 0 10.78l4.01-3.1Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.6 4.6 1.8l3.44-3.44A11.98 11.98 0 0 0 1.27 6.6l4.01 3.1C6.22 6.88 8.87 4.77 12 4.77Z" />
    </svg>
  );
}
function AppleMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.7 12.9c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-2-.9-3.2-.9-1.7 0-3.2 1-4 2.5-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.6-1-2.6-3.9ZM14.4 5.6c.7-.8 1.1-1.9 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4Z" /></svg>;
}
function MailMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.6" d="M4 6h16v12H4V6Zm0 1 8 6 8-6" /></svg>;
}

export function SignInReward({ coins, onClaim }: { coins: number; onClaim: () => void }) {
  return (
    <div className="reward-overlay" role="dialog" aria-modal="true" aria-labelledby="reward-title">
      <div className="reward-card">
        <div className="reward-coin">✦</div>
        <h2 id="reward-title">You&apos;re in!</h2>
        <p>Fun, interactive characters are ready to keep you company. Here&apos;s a gift to get you started.</p>
        <div className="reward-amount">+{coins.toLocaleString("en-US")} coins</div>
        <button className="reward-claim" onClick={onClaim}>Claim {coins.toLocaleString("en-US")} coins</button>
      </div>
    </div>
  );
}

export function SignInCard({ heading, subheading, onSignedIn }: { heading: string; subheading?: string; onSignedIn: (provider: MockAuth["provider"]) => void }) {
  return (
    <div className="signin-card">
      <h2>{heading}</h2>
      {subheading && <p>{subheading}</p>}
      <button className="signin-google" onClick={() => { mockSignIn("google"); onSignedIn("google"); }}><GoogleMark />Continue with Google</button>
      <div className="signin-secondary">
        <button onClick={() => { mockSignIn("apple"); onSignedIn("apple"); }}><AppleMark />Apple</button>
        <button onClick={() => { mockSignIn("email"); onSignedIn("email"); }}><MailMark />Email</button>
      </div>
      <small>By continuing you agree to our Terms of Service and Privacy Policy.</small>
    </div>
  );
}

export function WelcomeModal({ onDone }: { onDone: (profile: GuestProfile) => void }) {
  const [pronoun, setPronoun] = useState<GuestProfile["pronoun"] | null>(null);
  const [ageBand, setAgeBand] = useState<GuestProfile["ageBand"] | null>(null);
  const [preference, setPreference] = useState<GuestProfile["preference"]>(null);
  const ready = pronoun && ageBand;

  function enter() {
    if (!pronoun || !ageBand) return;
    const profile = { pronoun, ageBand, preference };
    saveGuestProfile(profile);
    onDone({ ...profile, createdAt: new Date().toISOString() });
  }

  return (
    <div className="welcome-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-card">
        <h1 id="welcome-title"><em>Hi,</em> Welcome to Plum</h1>
        <p className="welcome-sub">Tell us more for a better personalized experience. Some content may not be suitable for users of all ages.</p>

        <div className="welcome-field">
          <span>Which pronoun do you use? <i>✳</i></span>
          <div className="pronoun-row">
            {PRONOUNS.map((item) => (
              <button key={item.value} className={`pronoun-option${pronoun === item.value ? " active" : ""}`} onClick={() => setPronoun(item.value)}>
                <span className="pronoun-circle">{item.mark}</span>
                <b>{item.value}</b>
              </button>
            ))}
          </div>
        </div>

        <div className="welcome-field">
          <span>What&apos;s your age? <i>✳</i></span>
          <div className="welcome-grid">
            {AGE_BANDS.map((band) => (
              <button key={band} className={ageBand === band ? "active" : ""} onClick={() => setAgeBand(band)}>{band}</button>
            ))}
          </div>
        </div>

        <div className="welcome-field">
          <span>What&apos;s your relationship preference?</span>
          <div className="welcome-grid">
            {PREFERENCES.map((pref) => (
              <button key={pref.value} className={preference === pref.value ? "active" : ""} onClick={() => setPreference(pref.value)}>{pref.emoji} {pref.value}</button>
            ))}
          </div>
        </div>

        <button className="welcome-enter" disabled={!ready} onClick={enter}>Enter Plum Now!</button>
      </div>
    </div>
  );
}
