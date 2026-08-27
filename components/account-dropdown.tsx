"use client";

import { useRouter } from "next/navigation";
import { LogoutIcon, StudioIcon, SubscriptionIcon, WalletIcon } from "@/components/icons";
import { ACCOUNT_MENU } from "@/lib/copy";
import type { AuthUser } from "@/lib/types";

type AccountDropdownProps = {
  user: AuthUser;
  open: boolean;
  onToggle: () => void;
  onSignOut: () => void;
  active?: "studio" | "wallet" | "subscription";
};

export function AccountDropdown({ user, open, onToggle, onSignOut, active }: AccountDropdownProps) {
  const router = useRouter();
  const go = (path: string) => {
    onToggle();
    router.push(path);
  };

  return (
    <div className="header-menu-wrap account-menu-wrap">
      <button className="account-button" data-overlay-trigger onClick={onToggle} aria-label="Account" aria-expanded={open}>
        <i>{user.display_name.slice(0, 1).toUpperCase()}</i><span>{user.display_name}</span><b>⌄</b>
      </button>
      {open && <div className="header-dropdown account-menu account-menu-rich" data-overlay>
        <button className={active === "studio" ? "selected" : ""} onClick={() => go("/studio")}><StudioIcon /><span>{ACCOUNT_MENU.studio}</span></button>
        <button className={active === "wallet" ? "selected" : ""} onClick={() => go("/wallet")}><WalletIcon /><span>{ACCOUNT_MENU.wallet}</span></button>
        <button className={active === "subscription" ? "selected" : ""} onClick={() => go("/subscription")}><SubscriptionIcon /><span>{ACCOUNT_MENU.subscription}</span></button>
        <button className="account-menu-signout" onClick={onSignOut}><LogoutIcon /><span>{ACCOUNT_MENU.signOut}</span></button>
      </div>}
    </div>
  );
}
