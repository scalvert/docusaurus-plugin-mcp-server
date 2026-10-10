import { McpInstallButton } from './McpInstallButton.js';
import { ForAgents, ForHumans } from './Audience.js';
import { AgentGuide, Check, DoneWhen, Prerequisites, Step, Symptom } from './Guide.js';

/**
 * The components the plugin adds to Docusaurus's MDX components, so pages can
 * use them without an import (the `mdxComponents` plugin option). A site whose
 * swizzled `MDXComponents` doesn't wrap `@theme-original/MDXComponents` can
 * spread this into its own.
 */
export const mdxComponents = {
  McpInstallButton,
  ForAgents,
  ForHumans,
  AgentGuide,
  DoneWhen,
  Prerequisites,
  Step,
  Check,
  Symptom,
} as const;
