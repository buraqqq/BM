const TR_MAP: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i", ö: "o", Ö: "o",
  ş: "s", Ş: "s", ü: "u", Ü: "u",
};

export function slugify(input: string): string {
  const replaced = input
    .split("")
    .map((ch) => TR_MAP[ch] ?? ch)
    .join("");
  return replaced
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>
): Promise<string> {
  const baseSlug = slugify(base) || "urun";
  let candidate = baseSlug;
  let i = 2;
  while (await exists(candidate)) {
    candidate = `${baseSlug}-${i}`;
    i += 1;
  }
  return candidate;
}
