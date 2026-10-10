import type { ReactNode } from 'react';
import { GUIDE_ATTRIBUTES as A, type GuideKind } from '../guides/contract.js';

/**
 * Agent guide components (format version 1, see `docs/agent-guide-format.md`).
 * They render `data-mcp-*` attributes, which the build reads from the page to
 * compile the guide into an Agent Skill. Labels the components add for
 * readers are marked, so the compiled guide (which writes its own) drops them.
 */

/** A label added for readers: kept on the page and in its document, dropped from the compiled guide. */
const LABEL = { [A.label]: '' };

/** `a \`b\` c` → a <code>b</code> c, for titles passed as strings. */
function withCode(text: string): ReactNode {
  return text
    .split('`')
    .map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part));
}

/** Only the attributes that have a value, so React renders no empty ones. */
function attributes(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

export interface AgentGuideProps {
  /** The compiled skill's name: lowercase letters, digits, and single hyphens */
  name: string;
  kind: GuideKind;
  /** What the guide does and when to use it; the compiled skill's description */
  description: string;
  /** Defaults to the page's `h1` */
  title?: string;
  children?: ReactNode;
}

/** A guide: wraps its steps (setup) or symptoms (troubleshooting). */
export function AgentGuide({ name, kind, description, title, children }: AgentGuideProps) {
  return (
    <div
      {...attributes({
        [A.guide]: name,
        [A.guideKind]: kind,
        [A.guideDescription]: description,
        [A.guideTitle]: title,
      })}
    >
      {children}
    </div>
  );
}

export interface GuidePartProps {
  children?: ReactNode;
}

/** How to tell the whole guide worked. One per guide. */
export function DoneWhen({ children }: GuidePartProps) {
  return (
    <div {...{ [A.doneWhen]: '' }}>
      <strong {...LABEL}>Done when:</strong> {children}
    </div>
  );
}

/** What the user needs before starting. Setup guides only. */
export function Prerequisites({ children }: GuidePartProps) {
  return <div {...{ [A.prerequisites]: '' }}>{children}</div>;
}

export interface StepProps {
  /** Stable ID, unique in the guide; the compiled heading's `{#id}` */
  id: string;
  /** Defaults to the first heading inside the step */
  title?: string;
  /** `"user"`: a person has to do this step; the agent hands over and waits */
  needs?: 'user';
  /** The step changes or deletes something; the agent asks first */
  confirm?: boolean;
  /** Space-separated symptom IDs to offer when this step's check fails */
  symptoms?: string;
  children?: ReactNode;
}

/** One action in a setup guide. */
export function Step({ id, title, needs, confirm, symptoms, children }: StepProps) {
  return (
    <div
      {...attributes({
        [A.step]: id,
        [A.stepTitle]: title,
        [A.stepNeeds]: needs,
        [A.stepConfirm]: confirm ? '' : undefined,
        [A.stepSymptoms]: symptoms,
      })}
    >
      {title ? (
        <p {...LABEL}>
          <strong>{withCode(title)}</strong>
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** How to tell a step, or a symptom's fix, worked: something observable. */
export function Check({ children }: GuidePartProps) {
  return (
    <div {...{ [A.check]: '' }}>
      <strong {...LABEL}>Check:</strong> {children}
    </div>
  );
}

export interface SymptomProps {
  /** Stable ID, unique in the guide; with `title`, also the element's `id`, for links */
  id: string;
  /**
   * What the user sees; start with the exact error text. Defaults to the
   * first heading inside the symptom, so an existing section can be wrapped.
   */
  title?: string;
  /** The guide this belongs to, when it isn't inside one */
  guide?: string;
  children?: ReactNode;
}

/** One troubleshooting entry: **Cause:**, **Fix:**, a `Check`, and **Escalate if:**. */
export function Symptom({ id, title, guide, children }: SymptomProps) {
  return (
    <div
      // With a heading inside, the heading's own id is the anchor.
      id={title ? id : undefined}
      {...attributes({ [A.symptom]: id, [A.symptomTitle]: title, [A.symptomGuide]: guide })}
    >
      {title ? (
        <p {...LABEL}>
          <strong>{withCode(title)}</strong>
        </p>
      ) : null}
      {children}
    </div>
  );
}
