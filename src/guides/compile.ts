/**
 * Compiles agent guides (format version 1) from the fragments page
 * extraction found: attaches symptoms to their guides across pages, runs the
 * build checks, and renders each guide's `SKILL.md` and
 * `references/troubleshooting.md` as a skill source.
 *
 * Pure: fragments in, skill sources and diagnostics out. No filesystem, no
 * Docusaurus, no logging; the build pipeline decides what to do with errors
 * and warnings.
 */

import { stringify as stringifyYaml } from 'yaml';
import { documentId } from '../artifacts/bundle.js';
import { isValidSkillName, MAX_SKILL_NAME_LENGTH } from '../skills/frontmatter.js';
import type { SkillSource } from '../skills/packager.js';
import {
  GUIDE_FORMAT_VERSION,
  GUIDE_KINDS,
  HOW_TO_USE,
  SKILL_SECTIONS,
  STEP_MARKERS,
  TROUBLESHOOTING_FILE,
  sourceNote,
  type GuideKind,
} from './contract.js';
import type { GuideFragment, PageGuides, StepFragment, SymptomFragment } from './extract.js';

/** Where guide errors send authors. */
export const AGENT_GUIDES_DOCS =
  'https://docusaurus-plugin-mcp-server.vercel.app/docs/guides/agent-guides';

/**
 * Thrown by the build when agent guides fail the format's checks. Lists
 * every problem, each naming its page.
 *
 * @experimental May change in a 2.x minor release; pin a version if you depend on it.
 */
export class GuideValidationError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      `[MCP] Invalid agent guides:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\n` +
        `See ${AGENT_GUIDES_DOCS}`
    );
    this.name = 'GuideValidationError';
    this.problems = problems;
  }
}

export interface CompileGuidesInput {
  /** Each page's guide markup, from page extraction */
  pages: PageGuides[];
  /** Absolute site URL including the base path; guides link back to their pages with it */
  baseUrl?: string;
}

export interface CompiledGuides {
  /** One skill source per valid guide, in name order */
  sources: SkillSource[];
  /** Problems that fail the build */
  errors: string[];
  warnings: string[];
}

/** A guide with everything the checks need resolved. */
interface Assembled {
  fragment: GuideFragment;
  name: string;
  kind: GuideKind;
  description: string;
  title: string;
  url: string;
  symptoms: SymptomFragment[];
  /** False when a guide-level check failed; still checked, never packaged */
  valid: boolean;
}

function byRoute(a: { route: string }, b: { route: string }): number {
  return a.route < b.route ? -1 : a.route > b.route ? 1 : 0;
}

/** Compile every guide on the site. */
export function compileGuides({ pages, baseUrl }: CompileGuidesInput): CompiledGuides {
  const errors: string[] = [];
  const warnings: string[] = [];
  const url = (route: string) => documentId({ route }, baseUrl);

  // Page order differs across file systems; sort so output is stable.
  const sorted = [...pages].sort(byRoute);
  for (const page of sorted) {
    errors.push(...page.errors);
    warnings.push(...page.warnings);
  }

  const guides: Assembled[] = [];
  const byName = new Map<string, Assembled>();
  for (const fragment of sorted.flatMap((page) => page.guides)) {
    const where = `${fragment.route}: guide${fragment.name ? ` "${fragment.name}"` : ''}`;
    const problems: string[] = [];
    if (!fragment.name) {
      problems.push('has no name');
    } else if (!isValidSkillName(fragment.name)) {
      problems.push(
        `name "${fragment.name}" isn't a valid skill name (1-${MAX_SKILL_NAME_LENGTH} lowercase letters, digits, and single hyphens)`
      );
    }
    if (!fragment.kind) {
      problems.push('has no kind');
    } else if (!(GUIDE_KINDS as readonly string[]).includes(fragment.kind)) {
      problems.push(`kind "${fragment.kind}" must be one of ${GUIDE_KINDS.join(', ')}`);
    }
    if (!fragment.description) problems.push('has no description');
    if (fragment.doneWhen.length === 0) problems.push('has no <DoneWhen>');
    if (fragment.doneWhen.length > 1)
      problems.push(`has ${fragment.doneWhen.length} <DoneWhen> blocks; use one`);
    if (fragment.kind === 'setup' && fragment.steps.length === 0)
      problems.push('is a setup guide with no steps');

    const existing = fragment.name ? byName.get(fragment.name) : undefined;
    if (existing) {
      // A second guide of the same name: report it, but don't check or attach to it.
      errors.push(`${where} has the same name as the guide on ${existing.fragment.route}`);
      continue;
    }

    errors.push(...problems.map((problem) => `${where} ${problem}`));
    const guide: Assembled = {
      fragment,
      name: fragment.name ?? '',
      kind: fragment.kind as GuideKind,
      description: fragment.description ?? '',
      title: fragment.title ?? fragment.pageTitle,
      url: url(fragment.route),
      symptoms: [...fragment.symptoms],
      valid: problems.length === 0,
    };
    guides.push(guide);
    if (fragment.name) byName.set(fragment.name, guide);
  }

  // A symptom outside a guide attaches to every guide it names.
  for (const symptom of sorted.flatMap((page) => page.symptoms)) {
    for (const name of symptom.guides) {
      const guide = byName.get(name);
      if (guide) {
        guide.symptoms.push(symptom);
      } else {
        errors.push(
          `${symptom.route}: <Symptom id="${symptom.id ?? ''}"> names guide "${name}", which doesn't exist`
        );
      }
    }
  }

  // Check every guide, so one build reports every problem; package only the clean ones.
  const sources: SkillSource[] = [];
  for (const guide of guides) {
    const before = errors.length;
    checkGuide(guide, errors, warnings);
    if (guide.valid && errors.length === before) {
      sources.push(toSource(guide, url));
    }
  }
  sources.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return { sources, errors, warnings };
}

function checkGuide(guide: Assembled, errors: string[], warnings: string[]): void {
  const where = (route: string) => `${route}: guide${guide.name ? ` "${guide.name}"` : ''}`;
  const route = guide.fragment.route;

  const stepIds = new Set<string>();
  guide.fragment.steps.forEach((step, index) => {
    const label = step.id ? `step "${step.id}"` : `step ${index + 1}`;
    if (!step.id) {
      errors.push(`${where(route)}: ${label} has no id`);
    } else if (stepIds.has(step.id)) {
      errors.push(`${where(route)}: two steps have the id "${step.id}"`);
    } else {
      stepIds.add(step.id);
    }
    if (!step.title)
      warnings.push(`${where(route)}: ${label} has no title or heading; using its id`);
    if (step.checks.length === 0) warnings.push(`${where(route)}: ${label} has no <Check>`);
  });

  const symptomIds = new Set<string>();
  for (const symptom of guide.symptoms) {
    if (!symptom.id) {
      errors.push(`${where(symptom.route)}: a <Symptom> has no id`);
    } else if (symptomIds.has(symptom.id)) {
      errors.push(`${where(symptom.route)}: two symptoms have the id "${symptom.id}"`);
    } else {
      symptomIds.add(symptom.id);
    }
    if (!symptom.title)
      errors.push(`${where(symptom.route)}: symptom "${symptom.id ?? ''}" has no title or heading`);
  }

  for (const step of guide.fragment.steps) {
    for (const id of step.symptoms) {
      if (!symptomIds.has(id)) {
        errors.push(
          `${where(route)}: step "${step.id ?? ''}" names symptom "${id}", which the guide doesn't have`
        );
      }
    }
  }

  if (guide.symptoms.length === 0) warnings.push(`${where(route)} has no symptoms`);
}

function toSource(guide: Assembled, url: (route: string) => string): SkillSource {
  const files = [{ path: 'SKILL.md', bytes: Buffer.from(renderSkillMd(guide), 'utf8') }];
  if (guide.symptoms.length > 0) {
    files.push({
      path: TROUBLESHOOTING_FILE,
      bytes: Buffer.from(renderTroubleshooting(guide, url), 'utf8'),
    });
  }
  return {
    name: guide.name,
    origin: `agent guide "${guide.name}" (${guide.fragment.route})`,
    kind: 'guide',
    files,
  };
}

/** `**Check:** text`, or the label on its own line when the check is several blocks. */
function renderChecks(checks: string[]): string[] {
  return checks.map((check) =>
    check.includes('\n\n')
      ? `**${STEP_MARKERS.check}**\n\n${check}`
      : `**${STEP_MARKERS.check}** ${check}`
  );
}

function symptomLink(symptom: SymptomFragment): string {
  return `[${symptom.title}](${TROUBLESHOOTING_FILE}#${symptom.id})`;
}

function ifCheckFails(step: StepFragment, guide: Assembled): string | undefined {
  if (guide.symptoms.length === 0) return undefined;
  const named = step.symptoms
    .map((id) => guide.symptoms.find((symptom) => symptom.id === id))
    .filter((symptom): symptom is SymptomFragment => symptom !== undefined);
  const targets =
    named.length > 0 ? named.map(symptomLink) : [`[Troubleshooting](${TROUBLESHOOTING_FILE})`];
  const list =
    targets.length === 1
      ? targets[0]
      : `${targets.slice(0, -1).join(', ')} or ${targets[targets.length - 1]}`;
  return `**${STEP_MARKERS.ifCheckFails}** see ${list}.`;
}

function renderStep(step: StepFragment, index: number, guide: Assembled): string[] {
  const blocks = [`### ${index + 1}. ${step.title ?? step.id} {#${step.id}}`];
  if (step.needsUser) blocks.push(`**${STEP_MARKERS.needsUser}**`);
  if (step.confirm) blocks.push(`**${STEP_MARKERS.confirm}**`);
  if (step.body) blocks.push(step.body);
  blocks.push(...renderChecks(step.checks));
  // Only a step with a check can fail one.
  const fails = step.checks.length > 0 ? ifCheckFails(step, guide) : undefined;
  if (fails) blocks.push(fails);
  return blocks;
}

/** The guide's `SKILL.md`. Sections always come in the order the format defines. */
function renderSkillMd(guide: Assembled): string {
  const frontmatter = stringifyYaml(
    {
      name: guide.name,
      description: guide.description,
      metadata: {
        'agent-guide': guide.kind,
        'agent-guide-format': String(GUIDE_FORMAT_VERSION),
        source: guide.url,
      },
    },
    // One line per value: hosts with simple frontmatter readers don't fold lines.
    { lineWidth: 0 }
  );

  const blocks: string[] = [`---\n${frontmatter}---`, `# ${guide.title}`];
  blocks.push(`## ${SKILL_SECTIONS.doneWhen}`, guide.fragment.doneWhen[0]!);
  if (guide.fragment.prerequisites.length > 0) {
    blocks.push(`## ${SKILL_SECTIONS.prerequisites}`, ...guide.fragment.prerequisites);
  }
  blocks.push(
    `## ${SKILL_SECTIONS.howToUse}`,
    HOW_TO_USE[guide.kind].map((line) => `- ${line}`).join('\n')
  );
  if (guide.fragment.steps.length > 0) {
    blocks.push(`## ${SKILL_SECTIONS.steps}`);
    guide.fragment.steps.forEach((step, index) => blocks.push(...renderStep(step, index, guide)));
  }
  if (guide.symptoms.length > 0) {
    blocks.push(
      `## ${SKILL_SECTIONS.troubleshooting}`,
      guide.symptoms.map((symptom) => `- ${symptomLink(symptom)}`).join('\n')
    );
  }
  blocks.push(`## ${SKILL_SECTIONS.source}`, sourceNote(guide.url));
  return `${blocks.join('\n\n')}\n`;
}

/** `references/troubleshooting.md`: each symptom's cause, fix, check, and when to escalate. */
function renderTroubleshooting(guide: Assembled, url: (route: string) => string): string {
  const blocks = [`# ${SKILL_SECTIONS.troubleshooting}: ${guide.title}`];
  for (const symptom of guide.symptoms) {
    const of = (label: string) =>
      symptom.blocks.filter((block) => block.label === label).map((block) => block.markdown);
    blocks.push(
      `## ${symptom.title} {#${symptom.id}}`,
      ...of('cause'),
      ...of('fix'),
      ...of('other'),
      ...renderChecks(symptom.checks),
      ...of('escalate'),
      `Source: ${url(symptom.route)}#${symptom.anchor ?? symptom.id}`
    );
  }
  return `${blocks.join('\n\n')}\n`;
}
