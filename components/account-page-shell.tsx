"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AccountDropdown } from "@/components/account-dropdown";
import { Brand } from "@/components/brand";
import { CommunityLink } from "@/components/community-link";
import { HEADER_LABELS } from "@/lib/copy";
import { formatCoins } from "@/lib/format";
import { logout } from "@/lib/api";
import { usePlumAuth } from "@/components/plum-auth";
import type { AuthUser } from "@/lib/types";

export type AccountSection = "studio" | "wallet" | "subscription";

type AccountPageContextValue = {
  user: AuthUser;
  balance: number;
};

const AccountPageContext = createContext<AccountPageContextValue | null>(null);

export function useAccountPage() {
  const value = useContext(AccountPageContext);
  if (!value) throw new Error("useAccountPage must be used inside AccountPageShell");
  return value;
}

export function AccountPageShell({
  active,
  eyebrow,
  title,
  description,
  children,
}: {
  active: AccountSection;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { context, loading, refresh } = usePlumAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const user = context?.actor.kind === "member" ? context.actor.user : null;
  const balance = context?.wallet?.balance ?? 0;

  useEffect(() => {
    if (!loading && !user) router.replace("/?login=1");
  }, [loading, router, user]);

  if (loading || !user) {
    return <main className="account-page-shell account-page-loading"><span>Loading account…</span></main>;
  }

  async function signOut() {
    try { await logout(); } catch { /* An expired session is already signed out. */ }
    setAccountOpen(false);
    await refresh();
    router.replace("/");
  }

  return (
    <AccountPageContext.Provider value={{ user, balance }}>
      <main className="account-page-shell">
        <header className="site-header account-site-header">
          <div className="header-brand-group"><Brand ariaLabel="Back to Plum home" /><CommunityLink /></div>
          <div className="site-header-actions">
            <button className="coin-button" onClick={() => router.push("/wallet")} aria-label={HEADER_LABELS.coinBalance(formatCoins(balance))}><span>✦</span><strong>{formatCoins(balance)}</strong></button>
            <AccountDropdown user={user} active={active} open={accountOpen} onToggle={() => setAccountOpen((open) => !open)} onSignOut={() => void signOut()} />
          </div>
        </header>
        <div className="account-page-inner">
          <header className="account-page-heading"><div><span className="account-page-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></header>
          {children}
        </div>
        <footer className="reference-footer account-page-footer"><Link href="/">Privacy Policy</Link><Link href="/">Terms of Service</Link><Link href="/">Community Guidelines</Link><Link href="/">About Us</Link><small>© 2026 PLUM. All rights reserved.</small></footer>
      </main>
    </AccountPageContext.Provider>
  );
}
