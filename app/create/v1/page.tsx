import { redirect } from "next/navigation";

/**
 * `/create/v1` was the prototype route while the creation flow was being built; it is now the same
 * page as `/create`. Kept as a redirect rather than deleted because the path is still written down
 * in the handoff docs and in people's bookmarks — and a saved draft link carries `?work_id=`, so
 * the query has to survive the hop or the redirect silently starts a blank draft.
 */
export default async function CreateV1RedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  const suffix = query.toString();
  redirect(suffix ? `/create?${suffix}` : "/create");
}
