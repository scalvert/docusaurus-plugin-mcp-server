import type { ReactNode } from 'react';
import { AUDIENCE_ATTRIBUTE } from '../agent-view/audience.js';

export interface AudienceProps {
  children?: ReactNode;
}

/**
 * Content for agents only. Hidden on the rendered page; included in what
 * agents get from it (`docs_fetch`, search). Use it for what an agent needs
 * and a person doesn't, such as exact commands or when to stop and hand back
 * to the user. Still public: it is in the page's HTML.
 *
 * Block-level: put it on its own lines, not inside a sentence.
 */
export function ForAgents({ children }: AudienceProps) {
  return (
    <div {...{ [AUDIENCE_ATTRIBUTE]: 'agents' }} hidden>
      {children}
    </div>
  );
}

/**
 * Content for people only. Shown on the rendered page; left out of what
 * agents get from it. Use it for directions that only make sense on screen,
 * such as "the blue button at the top right".
 *
 * Block-level: put it on its own lines, not inside a sentence.
 */
export function ForHumans({ children }: AudienceProps) {
  return <div {...{ [AUDIENCE_ATTRIBUTE]: 'humans' }}>{children}</div>;
}
