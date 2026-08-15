export type CreatorTag = {
  id: string;
  code: string;
  display_name: string;
  sort_order: number;
};

function key(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

/** Map stable IDs, codes, and legacy display names to at most five active Tag IDs. */
export function normalizeCreatorTagIds(values: unknown, options: CreatorTag[]) {
  const source = Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string")
    : typeof values === "string" ? values.split(/[,，]/) : [];
  const lookup = new Map<string, string>();
  for (const option of options) {
    lookup.set(key(option.id), option.id);
    lookup.set(key(option.code), option.id);
    lookup.set(key(option.display_name), option.id);
  }
  const matched: string[] = [];
  for (const value of source) {
    const id = lookup.get(key(value));
    if (id && !matched.includes(id)) matched.push(id);
    if (matched.length === 5) break;
  }
  return matched;
}
