/** Matches a leading YAML frontmatter block; group 1 is the YAML source. */
export const FRONTMATTER_PATTERN = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
