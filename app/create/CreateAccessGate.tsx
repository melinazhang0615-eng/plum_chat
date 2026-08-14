"use client";

import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { EmailSignInDialog, PlumAuthProvider, usePlumAuth } from "@/components/plum-auth";
import { logout } from "@/lib/api";
import { CharacterCreateV1 } from "./v1/CharacterCreateV1";

function GateContent() {
  const router = useRouter();
  const { context, loading, refresh } = usePlumAuth();

  async function signOut() {
    try { await logout(); } catch { /* An expired session is already signed out. */ }
    await refresh();
  }

  if (loading) {
    return <main className="create-access-shell" aria-label="Checking sign-in status"><Brand /></main>;
  }

  if (context?.actor.kind !== "member") {
    const returnTo = window.location.pathname + window.location.search;
    return <main className="create-access-shell">
      <Brand />
      <EmailSignInDialog
        returnTo={returnTo}
        onAuthenticated={() => undefined}
        onClose={() => router.replace("/")}
      />
    </main>;
  }

  return <CharacterCreateV1 user={context.actor.user} balance={context.wallet?.balance ?? 0} onSignOut={signOut} />;
}

export function CreateAccessGate() {
  return <PlumAuthProvider><GateContent /></PlumAuthProvider>;
}
