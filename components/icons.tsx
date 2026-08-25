/**
 * Icons that appear in the shared site header, and therefore on more than one page.
 *
 * Page-local icons stay in their page — this file is for the ones that were literally copy-pasted
 * between routes, where a redraw had to be applied four times or the header would silently drift.
 * No `"use client"`: these are plain functions with no hooks, so they work in either environment.
 */

export function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.3 4.3" /></svg>;
}

export function CreateIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

export function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

export function TranslationIcon() {
  return <svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M550.761 343.763l1.717 3.313 122.97 281.118a26.353 26.353 0 0 1-46.772 24.064l-1.506-2.952-31.533-72.071H461.011l-31.503 72.071a26.353 26.353 0 0 1-49.423-18.01l1.114-3.102 123-281.118a26.383 26.383 0 0 1 46.562-3.313zm-22.407 79.601-44.273 101.165h88.516l-44.273-101.165z" /><path d="M521.306 120.471a377.826 377.826 0 0 1 370.146 302.2 26.353 26.353 0 1 1-51.621 10.481 325.12 325.12 0 0 0-623.195-48.489l-.903 2.56 58.307-19.426a26.353 26.353 0 0 1 32.106 13.583l1.204 3.072a26.353 26.353 0 0 1-13.552 32.106l-3.103 1.204-105.411 35.147a26.353 26.353 0 0 1-34.154-30.238 377.826 377.826 0 0 1 370.146-302.2zm334.878 423.393a26.353 26.353 0 0 1 35.298 29.847 377.826 377.826 0 0 1-740.352 0 26.353 26.353 0 0 1 51.652-10.481 325.12 325.12 0 0 0 620.213 56.23l2.891-7.469-42.134 16.203a26.353 26.353 0 0 1-32.678-12.107l-1.385-3.012a26.353 26.353 0 0 1 12.137-32.678l3.012-1.385 91.346-35.148z" /></svg>;
}

export function AccountIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.8-4 2.9-6 6.5-6s5.7 2 6.5 6" /></svg>;
}

export function WalletIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h15.5A1.5 1.5 0 0 1 21 9v9.5A1.5 1.5 0 0 1 19.5 20h-15A2.5 2.5 0 0 1 2 17.5v-11A2.5 2.5 0 0 1 4.5 4H18" /><path d="M2 8h16.5a2.5 2.5 0 0 1 0 5H16" /></svg>;
}

export function SubscriptionIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.4 4.8 5.3.8-3.8 3.7.9 5.2-4.8-2.5-4.8 2.5.9-5.2-3.8-3.7 5.3-.8L12 3Z" /><path d="M5 19h14" /></svg>;
}

export function StudioIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5V5.8A1.8 1.8 0 0 1 5.8 4h12.4A1.8 1.8 0 0 1 20 5.8v13.7" /><path d="M4 19.5c0-1.4 1.1-2.5 2.5-2.5H20M8 8h8M8 12h5" /></svg>;
}

export function LogoutIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5.8A1.8 1.8 0 0 0 4 5.8v12.4A1.8 1.8 0 0 0 5.8 20H10M14 8l4 4-4 4M18 12H8" /></svg>;
}

export function CopyIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
}
