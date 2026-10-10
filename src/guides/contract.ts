/**
 * The agent guide contract, format version 1 (`docs/agent-guide-format.md`):
 * the attributes a page uses to mark up a guide, and the fixed text the
 * compiled skill carries. The theme components write these attributes, page
 * extraction reads them, and the compiler writes the text, so all three
 * import them from here. `tests/guide-contract-test.ts` checks that the
 * format spec quotes this text exactly.
 *
 * Edge-safe and React-free.
 */

/** Recorded in each compiled skill as `metadata.agent-guide-format`. */
export const GUIDE_FORMAT_VERSION = 1;

export const GUIDE_KINDS = ['setup', 'troubleshooting'] as const;
export type GuideKind = (typeof GUIDE_KINDS)[number];

/** Every attribute a guide's markup uses. Props map to attributes of the same name. */
export const GUIDE_ATTRIBUTES = {
  guide: 'data-mcp-guide',
  guideKind: 'data-mcp-guide-kind',
  guideDescription: 'data-mcp-guide-description',
  guideTitle: 'data-mcp-guide-title',
  doneWhen: 'data-mcp-done-when',
  prerequisites: 'data-mcp-prerequisites',
  step: 'data-mcp-step',
  stepTitle: 'data-mcp-step-title',
  stepNeeds: 'data-mcp-step-needs',
  stepConfirm: 'data-mcp-step-confirm',
  stepSymptoms: 'data-mcp-step-symptoms',
  check: 'data-mcp-check',
  symptom: 'data-mcp-symptom',
  symptomTitle: 'data-mcp-symptom-title',
  symptomGuide: 'data-mcp-symptom-guide',
  /**
   * Marks a label a component adds for readers (a step's title, "Check:").
   * It stays on the page and in the page's document; compiled guides drop
   * it, since the compiler writes its own labels.
   */
  label: 'data-mcp-guide-label',
} as const;

/** `data-mcp-guide-kind` → `dataMcpGuideKind`: the property name HTML parsing gives an attribute. */
export function attributeProperty(attribute: string): string {
  return attribute.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

/** Paragraph labels the build reads inside a symptom. */
export const SYMPTOM_LABELS = {
  cause: 'Cause:',
  fix: 'Fix:',
  escalate: 'Escalate if:',
} as const;

/** Section headings of a compiled `SKILL.md`, in order. */
export const SKILL_SECTIONS = {
  doneWhen: 'Done when',
  prerequisites: 'Before you start',
  howToUse: 'How to use this guide',
  steps: 'Steps',
  troubleshooting: 'Troubleshooting',
  source: 'Source',
} as const;

/** Markers a compiled step carries. */
export const STEP_MARKERS = {
  needsUser: 'Needs the user.',
  confirm: 'Confirm first.',
  check: 'Check:',
  ifCheckFails: 'If the check fails:',
} as const;

/** The fixed "How to use this guide" text, by kind. Not written by the author. */
export const HOW_TO_USE: Record<GuideKind, readonly string[]> = {
  setup: [
    "Do the steps in order. Run them yourself, or walk the user through them one at a time if they'd rather do it themselves or you can't run them.",
    "After each step, run its check. Don't move on until it passes.",
    'If a check fails, look for the matching symptom under Troubleshooting. If none matches, stop and tell the user what you saw.',
    "A step marked **Needs the user** needs a person. Tell the user what to do and wait for them to confirm it's done.",
    'Ask the user before running a step marked **Confirm first**.',
    "Don't ask the user to paste passwords, tokens, or keys into the chat. When a step needs one, tell the user where to put it.",
  ],
  troubleshooting: [
    'Ask the user what they see, or read the error yourself, and match it to a symptom below. Error text is quoted exactly, so search for it.',
    "Apply the fix, then run the symptom's check.",
    'If nothing matches, or the check still fails, stop and tell the user what you saw.',
  ],
};

/** The closing "Source" paragraph, pointing back at the page the guide came from. */
export function sourceNote(url: string): string {
  return `Generated from ${url}. If a step doesn't match what the user sees, tell them, and point them to that page.`;
}

/** Where a guide's symptoms go in the compiled skill. */
export const TROUBLESHOOTING_FILE = 'references/troubleshooting.md';
