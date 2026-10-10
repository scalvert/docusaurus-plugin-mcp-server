/** Matches a leading YAML frontmatter block; group 1 is the YAML source. */
export const FRONTMATTER_PATTERN = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Agent Skills naming rule: lowercase alphanumerics separated by single hyphens */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SKILL_NAME_LENGTH = 64;

/** Whether `name` is a valid Agent Skills name. */
export function isValidSkillName(name: string): boolean {
  return SKILL_NAME_PATTERN.test(name) && name.length <= MAX_SKILL_NAME_LENGTH;
}
