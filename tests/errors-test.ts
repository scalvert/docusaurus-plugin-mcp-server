import { describe, it, expect, vi } from 'vitest';
import { ConfigurationError, internalErrorBody } from '../src/errors.js';

describe('ConfigurationError', () => {
  it('is an Error with its name, message, and cause', () => {
    const cause = new Error('root');
    const error = new ConfigurationError('fix it', { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ConfigurationError');
    expect(error.message).toBe('fix it');
    expect(error.cause).toBe(cause);
    // The brand is non-enumerable, so serialization is unchanged from 2.1.
    expect(JSON.parse(JSON.stringify({ e: error }))).toEqual({ e: { name: 'ConfigurationError' } });
  });

  it('recognizes instances from another copy of the module', async () => {
    // Each package entry point bundles its own copy of errors.ts.
    vi.resetModules();
    const copy = await import('../src/errors.js');
    vi.resetModules();

    const foreign = new copy.ConfigurationError('from the other copy');
    expect(copy.ConfigurationError).not.toBe(ConfigurationError);
    expect(foreign instanceof ConfigurationError).toBe(true);
    expect(new ConfigurationError('x') instanceof copy.ConfigurationError).toBe(true);
    expect(JSON.parse(internalErrorBody(foreign)).error.message).toBe('from the other copy');
  });

  it('rejects look-alikes and non-objects', () => {
    const lookalike = Object.assign(new Error('x'), { name: 'ConfigurationError' });
    expect(lookalike instanceof ConfigurationError).toBe(false);
    expect((null as unknown) instanceof ConfigurationError).toBe(false);
    expect(('ConfigurationError' as unknown) instanceof ConfigurationError).toBe(false);
    expect(JSON.parse(internalErrorBody(lookalike)).error.message).toBe('Internal server error');
  });

  it('keeps ordinary instanceof for subclasses', () => {
    class StaleIndexError extends ConfigurationError {}
    const base = new ConfigurationError('base');
    const sub = new StaleIndexError('sub');

    expect(sub instanceof StaleIndexError).toBe(true);
    expect(sub instanceof ConfigurationError).toBe(true);
    expect(base instanceof StaleIndexError).toBe(false);
  });
});
