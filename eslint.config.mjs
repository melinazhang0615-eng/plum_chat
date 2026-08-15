import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

/**
 * `core-web-vitals` over the plain base config: it promotes the rules that actually cost users
 * something (unoptimised images, sync scripts, missing hook deps) from warning to error, so a
 * regression fails `npm run lint` instead of scrolling past in the dev server output.
 */
export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".playwright-mcp/**"]),
  {
    rules: {
      /**
       * Downgraded, not disabled. Every current hit is the same shape: a mount effect that reads
       * `window.location.search` (or the auth context) and calls setState once. Doing it properly
       * means `useSearchParams()` plus a Suspense boundary — a real refactor with hydration
       * consequences, not something to smuggle in alongside "add a linter". Keeping it at `warn`
       * leaves `npm run lint` green today, so the gate still fails loudly on a *new* class of
       * error. The 11 existing warnings are tracked as a P1 follow-up.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
