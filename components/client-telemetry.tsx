"use client";

import { useEffect } from "react";
import { installClientErrorReporting } from "@/lib/telemetry";

/**
 * Installs the global failure handlers once, from the root layout.
 *
 * Renders nothing, and deliberately does not read auth or route state — it must keep working
 * when those are the things that are broken.
 *
 * Known limit: an effect runs after hydration, so a failure thrown before this mounts is only
 * caught if it also surfaces as a later rejection. Catching literally the first frame would
 * mean an inline script in `<head>`, which is a CSP problem we do not want to buy yet.
 */
export function ClientTelemetry() {
  useEffect(() => {
    installClientErrorReporting();
  }, []);
  return null;
}
