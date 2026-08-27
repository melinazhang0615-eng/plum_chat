/**
 * Re-run a read when the user returns to this tab. Browsers commonly emit both
 * `visibilitychange` and `focus` for one return, so keep at most one refresh in flight.
 */
export function subscribeToVisiblePageReturns(refresh: () => Promise<void>) {
  let pending = false;

  const refreshIfVisible = () => {
    if (document.visibilityState !== "visible" || pending) return;
    pending = true;
    void refresh().finally(() => { pending = false; });
  };

  window.addEventListener("focus", refreshIfVisible);
  document.addEventListener("visibilitychange", refreshIfVisible);
  return () => {
    window.removeEventListener("focus", refreshIfVisible);
    document.removeEventListener("visibilitychange", refreshIfVisible);
  };
}
