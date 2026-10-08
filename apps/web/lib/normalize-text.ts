/**
 * Diacritics-insensitive text key for search/matching (FX-11).
 *
 * Strips Vietnamese tone marks via NFD, then maps the precomposed `đ`/`Đ`
 * (U+0111/U+0110) — which NFD does NOT decompose — to `d`, so "da nang" matches
 * "Đà Nẵng". Shared by the library browser and the command palette.
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim();
}
