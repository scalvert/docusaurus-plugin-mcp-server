/**
 * Reads agent guide markup out of one page (build-time, hast). Page
 * extraction calls it with the page's agent view, in the same parse that
 * makes the document, and gets back the page's guide fragments plus any
 * placement problems as data. Assembling guides across pages, the remaining
 * checks, and rendering are `compileGuides`'s job.
 */

import type { Element, Root } from 'hast';
import { toString } from 'hast-util-to-string';
import { hastToMarkdown } from '../processing/markdown.js';
import { GUIDE_ATTRIBUTES, SYMPTOM_LABELS, attributeProperty } from './contract.js';

/** One step, as the page wrote it. Missing required fields are left for the compiler to report. */
export interface StepFragment {
  id?: string;
  /** The `title` prop, else the step's first heading */
  title?: string;
  needsUser: boolean;
  confirm: boolean;
  /** Symptom IDs from the `symptoms` prop */
  symptoms: string[];
  /** The step's Markdown, without its checks or its title heading */
  body: string;
  checks: string[];
}

/** A symptom paragraph, by its bold label. */
export type SymptomBlock = { label: 'cause' | 'fix' | 'escalate' | 'other'; markdown: string };

export interface SymptomFragment {
  id?: string;
  /** The `title` prop, else the symptom's first heading */
  title?: string;
  /** Where the symptom is on its page: its heading's `id`, else the symptom `id` */
  anchor?: string;
  /** The `guide` prop (required outside a guide) */
  guide?: string;
  /** The page it's on */
  route: string;
  blocks: SymptomBlock[];
  checks: string[];
}

export interface GuideFragment {
  name?: string;
  kind?: string;
  description?: string;
  /** The `title` prop; the compiler falls back to `pageTitle` */
  title?: string;
  route: string;
  pageTitle: string;
  doneWhen: string[];
  prerequisites: string[];
  steps: StepFragment[];
  symptoms: SymptomFragment[];
}

/** Everything guide-related on one page. */
export interface PageGuides {
  route: string;
  guides: GuideFragment[];
  /** Symptoms outside any guide, attached by their `guide` prop */
  symptoms: SymptomFragment[];
  /** Placement problems that fail the build */
  errors: string[];
  warnings: string[];
}

const PROPERTY = Object.fromEntries(
  Object.entries(GUIDE_ATTRIBUTES).map(([key, attribute]) => [key, attributeProperty(attribute)])
) as Record<keyof typeof GUIDE_ATTRIBUTES, string>;

const HEADING = /^h[1-6]$/;

/** A step number at the start of a heading's Markdown: `1. `, `2) `, or Markdown's escaped `1\. ` */
const STEP_NUMBER = /^\d+\\?[.)]\s+/;

/**
 * A heading's inline Markdown, so code spans in titles survive
 * (`` `401 invalid_token` when the host connects ``), or undefined if empty.
 */
async function headingText(heading: Element | undefined): Promise<string | undefined> {
  if (!heading) return undefined;
  const inline = without(heading, (child) => has(child, 'label'));
  return (await hastToMarkdown({ ...inline, tagName: 'p', properties: {} })).trim() || undefined;
}

function has(node: Element, key: keyof typeof GUIDE_ATTRIBUTES): boolean {
  return node.properties?.[PROPERTY[key]] !== undefined;
}

function value(node: Element, key: keyof typeof GUIDE_ATTRIBUTES): string | undefined {
  const raw = node.properties?.[PROPERTY[key]];
  if (raw === undefined || raw === null || raw === false) return undefined;
  const text = (Array.isArray(raw) ? raw.join(' ') : String(raw)).trim();
  return text === '' ? undefined : text;
}

/** Which kind of guide markup an element is, if any. */
function roleOf(
  node: Element
): 'guide' | 'doneWhen' | 'prerequisites' | 'step' | 'check' | 'symptom' | undefined {
  if (has(node, 'guide')) return 'guide';
  if (has(node, 'step')) return 'step';
  if (has(node, 'symptom')) return 'symptom';
  if (has(node, 'check')) return 'check';
  if (has(node, 'doneWhen')) return 'doneWhen';
  if (has(node, 'prerequisites')) return 'prerequisites';
  return undefined;
}

const NAMES = {
  guide: 'AgentGuide',
  doneWhen: 'DoneWhen',
  prerequisites: 'Prerequisites',
  step: 'Step',
  check: 'Check',
  symptom: 'Symptom',
} as const;

/** A copy of `node` without the descendants `drop` matches. */
function without(node: Element, drop: (child: Element) => boolean): Element {
  return {
    ...node,
    properties: { ...node.properties },
    children: node.children
      .filter((child) => child.type !== 'element' || !drop(child))
      .map((child) => (child.type === 'element' ? without(child, drop) : { ...child })),
  };
}

async function markdownOf(node: Element): Promise<string> {
  const content = without(node, (child) => has(child, 'label'));
  return (await hastToMarkdown({ ...content, tagName: 'div', properties: {} })).trim();
}

function children(node: Element): Element[] {
  return node.children.filter((child): child is Element => child.type === 'element');
}

/** The first heading in a step, unless it sits inside other guide markup. */
function firstHeading(node: Element): Element | undefined {
  for (const child of children(node)) {
    if (HEADING.test(child.tagName)) return child;
    if (roleOf(child) || has(child, 'label')) continue;
    const nested = firstHeading(child);
    if (nested) return nested;
  }
  return undefined;
}

function symptomLabel(node: Element): SymptomBlock['label'] {
  if (node.tagName !== 'p') return 'other';
  const first = node.children.find((child) => child.type !== 'text' || child.value.trim() !== '');
  if (first?.type !== 'element' || first.tagName !== 'strong') return 'other';
  const text = toString(first).trim();
  for (const [label, prefix] of Object.entries(SYMPTOM_LABELS)) {
    if (text === prefix) return label as SymptomBlock['label'];
  }
  return 'other';
}

interface Context {
  route: string;
  pageTitle: string;
  guide?: GuideFragment;
  step?: StepFragment;
  symptom?: SymptomFragment;
  /** Inside a block that can't hold guide markup */
  part?: 'doneWhen' | 'prerequisites' | 'check';
  result: PageGuides;
}

function misplaced(ctx: Context, role: keyof typeof NAMES, where: string): void {
  ctx.result.errors.push(`${ctx.route}: <${NAMES[role]}> ${where}`);
}

async function visit(node: Element, ctx: Context): Promise<void> {
  const role = roleOf(node);
  if (role && (ctx.part || (role !== 'check' && ctx.symptom))) {
    misplaced(ctx, role, `can't be inside ${ctx.part ? `<${NAMES[ctx.part]}>` : '<Symptom>'}`);
    return;
  }

  switch (role) {
    case 'guide':
      return visitGuide(node, ctx);
    case 'step':
      return visitStep(node, ctx);
    case 'symptom':
      return visitSymptom(node, ctx);
    case 'check':
      if (!ctx.step && !ctx.symptom) {
        misplaced(ctx, 'check', 'must be inside a <Step> or <Symptom>');
        return;
      }
      (ctx.step ?? ctx.symptom)!.checks.push(await markdownOf(node));
      return visitChildren(node, { ...ctx, part: 'check' });
    case 'doneWhen':
    case 'prerequisites':
      if (!ctx.guide || ctx.step) {
        misplaced(
          ctx,
          role,
          ctx.step ? "can't be inside a <Step>" : 'must be inside an <AgentGuide>'
        );
        return;
      }
      if (role === 'prerequisites' && ctx.guide.kind === 'troubleshooting') {
        misplaced(ctx, role, 'is only for setup guides');
        return;
      }
      ctx.guide[role].push(await markdownOf(node));
      return visitChildren(node, { ...ctx, part: role });
    default:
      return visitChildren(node, ctx);
  }
}

async function visitChildren(node: Element, ctx: Context): Promise<void> {
  for (const child of children(node)) {
    await visit(child, ctx);
  }
}

async function visitGuide(node: Element, ctx: Context): Promise<void> {
  if (ctx.guide) {
    misplaced(ctx, 'guide', "can't be nested in another guide");
    return;
  }
  const guide: GuideFragment = {
    name: value(node, 'guide'),
    kind: value(node, 'guideKind'),
    description: value(node, 'guideDescription'),
    title: value(node, 'guideTitle'),
    route: ctx.route,
    pageTitle: ctx.pageTitle,
    doneWhen: [],
    prerequisites: [],
    steps: [],
    symptoms: [],
  };
  ctx.result.guides.push(guide);
  await visitChildren(node, { ...ctx, guide });
}

async function visitStep(node: Element, ctx: Context): Promise<void> {
  if (!ctx.guide) {
    misplaced(ctx, 'step', 'must be inside an <AgentGuide>');
    return;
  }
  if (ctx.step) {
    misplaced(ctx, 'step', "can't be inside another <Step>");
    return;
  }
  if (ctx.guide.kind === 'troubleshooting') {
    misplaced(
      ctx,
      'step',
      `can't be in troubleshooting guide "${ctx.guide.name}": it has symptoms only`
    );
    return;
  }

  const titleProp = value(node, 'stepTitle');
  const heading = titleProp ? undefined : firstHeading(node);
  const step: StepFragment = {
    id: value(node, 'step'),
    // The compiler numbers steps, so drop a number the page's heading carries ("1. Install").
    title: titleProp ?? (await headingText(heading))?.replace(STEP_NUMBER, ''),
    needsUser: value(node, 'stepNeeds') === 'user',
    confirm: has(node, 'stepConfirm'),
    symptoms: (value(node, 'stepSymptoms') ?? '').split(/\s+/).filter(Boolean),
    body: await markdownOf(without(node, (child) => child === heading || has(child, 'check'))),
    checks: [],
  };
  ctx.guide.steps.push(step);
  await visitChildren(node, { ...ctx, step });
}

async function visitSymptom(node: Element, ctx: Context): Promise<void> {
  if (ctx.step) {
    misplaced(ctx, 'symptom', "can't be inside a <Step>");
    return;
  }
  const guideName = value(node, 'symptomGuide');
  const titleProp = value(node, 'symptomTitle');
  const heading = titleProp ? undefined : firstHeading(node);
  const id = value(node, 'symptom');
  const headingId = heading?.properties?.id;
  const symptom: SymptomFragment = {
    id,
    title: titleProp ?? (await headingText(heading)),
    anchor: typeof headingId === 'string' && headingId ? headingId : id,
    guide: guideName,
    route: ctx.route,
    blocks: [],
    checks: [],
  };

  const body = without(
    node,
    (child) => child === heading || has(child, 'check') || has(child, 'label')
  );
  for (const child of children(body)) {
    const markdown = await markdownOf(child);
    if (markdown) symptom.blocks.push({ label: symptomLabel(child), markdown });
  }

  if (ctx.guide) {
    if (guideName && guideName !== ctx.guide.name) {
      ctx.result.errors.push(
        `${ctx.route}: <Symptom id="${symptom.id ?? ''}"> is inside guide "${ctx.guide.name}" but names guide "${guideName}"`
      );
      return;
    }
    ctx.guide.symptoms.push(symptom);
  } else if (!guideName) {
    ctx.result.errors.push(
      `${ctx.route}: <Symptom id="${symptom.id ?? ''}"> is outside a guide, so it needs a guide prop naming one`
    );
    return;
  } else {
    ctx.result.symptoms.push(symptom);
  }
  await visitChildren(node, { ...ctx, symptom });
}

/** Whether an element carries any `data-mcp-*` attribute. */
function hasMcpAttribute(node: Element): boolean {
  return Object.keys(node.properties ?? {}).some((key) => key.startsWith('dataMcp'));
}

function countOutside(node: Root | Element, content: Element): number {
  let count = 0;
  for (const child of node.children) {
    if (child.type !== 'element' || child === content) continue;
    if (hasMcpAttribute(child)) count++;
    count += countOutside(child, content);
  }
  return count;
}

export interface ExtractGuidesInput {
  route: string;
  /** The page's title (its h1, else `<title>`), for guides without a `title` */
  pageTitle: string;
  /** The whole parsed page, to find markup outside the content element */
  tree: Root;
  /** The content element as found in `tree` */
  content: Element;
  /** The agent view of the content element: what guides are read from */
  view: Element;
}

/** The page's guide markup, or null if it has none. */
export async function extractGuides(input: ExtractGuidesInput): Promise<PageGuides | null> {
  const result: PageGuides = {
    route: input.route,
    guides: [],
    symptoms: [],
    errors: [],
    warnings: [],
  };
  await visit(input.view, { route: input.route, pageTitle: input.pageTitle, result });

  const outside = countOutside(input.tree, input.content);
  if (outside > 0) {
    result.warnings.push(
      `${input.route}: ${outside} element(s) with data-mcp-* attributes are outside the page's content element (contentSelectors), so they're ignored`
    );
  }

  const empty =
    result.guides.length === 0 &&
    result.symptoms.length === 0 &&
    result.errors.length === 0 &&
    result.warnings.length === 0;
  return empty ? null : result;
}
