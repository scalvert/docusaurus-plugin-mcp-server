/**
 * The format spec (docs/agent-guide-format.md) quotes the guide contract:
 * attribute names, the fixed "How to use this guide" text, and the format
 * version. This checks the quotes against src/guides/contract.ts, so a change
 * to either side shows up as a failing test instead of silent drift.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  GUIDE_ATTRIBUTES,
  GUIDE_FORMAT_VERSION,
  GUIDE_KINDS,
  HOW_TO_USE,
  SKILL_SECTIONS,
  STEP_MARKERS,
  SYMPTOM_LABELS,
  TROUBLESHOOTING_FILE,
  attributeProperty,
  sourceNote,
} from '../src/guides/contract.js';

const SPEC = fs.readFileSync(
  path.join(import.meta.dirname, '..', 'docs', 'agent-guide-format.md'),
  'utf8'
);

describe('docs/agent-guide-format.md quotes the contract', () => {
  it('declares the format version', () => {
    expect(SPEC).toMatch(new RegExp(`^formatVersion: ${GUIDE_FORMAT_VERSION}$`, 'm'));
    expect(SPEC).toContain(`agent-guide-format: '${GUIDE_FORMAT_VERSION}'`);
  });

  it('names both kinds', () => {
    for (const kind of GUIDE_KINDS) expect(SPEC).toContain(`| \`${kind}\` |`);
  });

  it.each(Object.entries(HOW_TO_USE))(
    'has the fixed %s how-to text, line for line',
    (_kind, lines) => {
      for (const line of lines) expect(SPEC).toContain(`- ${line}\n`);
    }
  );

  it('lists every element attribute in the components table', () => {
    for (const key of ['guide', 'doneWhen', 'prerequisites', 'step', 'check', 'symptom'] as const) {
      expect(SPEC).toContain(`\`${GUIDE_ATTRIBUTES[key]}`);
    }
    expect(SPEC).toContain(GUIDE_ATTRIBUTES.label);
  });

  it('uses the section headings, markers, and labels the compiler writes', () => {
    for (const heading of Object.values(SKILL_SECTIONS)) expect(SPEC).toContain(`## ${heading}`);
    expect(SPEC).toContain(`**${STEP_MARKERS.needsUser}**`);
    expect(SPEC).toContain(`**${STEP_MARKERS.check}**`);
    expect(SPEC).toContain(`**${STEP_MARKERS.ifCheckFails}**`);
    for (const label of Object.values(SYMPTOM_LABELS)) expect(SPEC).toContain(`**${label}**`);
    expect(SPEC).toContain(TROUBLESHOOTING_FILE);
    expect(SPEC).toContain(sourceNote('https://developers.glean.com/guides/mcp/setup'));
  });
});

describe('attributeProperty', () => {
  it.each([
    ['data-mcp-guide', 'dataMcpGuide'],
    ['data-mcp-guide-kind', 'dataMcpGuideKind'],
    ['data-mcp-done-when', 'dataMcpDoneWhen'],
  ])('%s → %s', (attribute, property) => {
    expect(attributeProperty(attribute)).toBe(property);
  });
});
