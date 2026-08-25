"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  useEffect(() => { router.replace("/studio"); }, [router]);
  return <main className="account-page-shell account-page-loading"><span>Opening My Studio…</span></main>;
}
