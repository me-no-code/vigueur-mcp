import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod/v4';
import { VigueurError } from '../../src/shared/errors.js';
import { answerSchema, requestEcho, statusValue, toolAnswer } from '../../src/tools/envelope.js';
import { callSignal, listPage, sliceForJson } from '../../src/tools/format.js';
import { toolError } from '../../src/tools/tool-error.js';
import { VERSION } from '../../src/version.js';
import { expectToolError } from '../helpers/answer.js';

const NOW = () => new Date('2026-11-16T10:42:07.512Z');
const schema = z.discriminatedUnion('outcome', [
  answerSchema('Légifrance', 'found', { id: z.string() }),
  answerSchema('Légifrance', 'not_found', { reason: z.string() }),
]);

describe('toolAnswer', () => {
  it('toolAnswer: schema order, unknown keys dropped, text is the JSON, clock and version', () => {
    const r = toolAnswer(
      schema,
      {
        cached: [],
        request: { tool: 't' },
        id: 'X',
        extra: 1,
        warnings: [],
        outcome: 'found',
        source: 'Légifrance',
      } as never,
      { now: NOW },
    );
    const answer = r.structuredContent as Record<string, unknown>;
    expect(Object.keys(answer)).toEqual([
      'source',
      'outcome',
      'warnings',
      'id',
      'request',
      'retrieved',
      'cached',
      'vigueur_version',
    ]);
    expect(answer.retrieved).toBe('2026-11-16T10:42:07Z');
    expect(answer.vigueur_version).toBe(VERSION);
    expect(r.content).toEqual([{ type: 'text', text: JSON.stringify(answer) }]);
  });

  it('toolAnswer throws when the body does not match its schema', () => {
    expect(() =>
      toolAnswer(
        schema,
        {
          source: 'Légifrance',
          outcome: 'found',
          warnings: [],
          request: { tool: 't' },
          cached: [],
        } as never,
        { now: NOW },
      ),
    ).toThrow();
  });
});

describe('requestEcho', () => {
  it('requestEcho: schema order, defaults applied, blank strings absent', () => {
    const input = z.object({
      code: z.string().optional(),
      number: z.string().optional(),
      at_date: z.string().optional(),
      offset: z.number().optional(),
    });
    expect(
      requestEcho(
        'legifrance_get_article',
        input,
        { code: ' Code civil ', number: '' },
        { at_date: '2026-11-16', offset: 0 },
      ),
    ).toEqual({
      tool: 'legifrance_get_article',
      code: 'Code civil',
      at_date: '2026-11-16',
      offset: 0,
    });
    expect(Object.keys(requestEcho('t', input, { offset: 3, code: 'x' }, {}))).toEqual([
      'tool',
      'code',
      'offset',
    ]);
  });
});

describe('statusValue', () => {
  it('statusValue maps the four reasons', () => {
    expect(
      statusValue(
        { inForce: false, reason: 'ended', from: '2000-01-01', until: '2016-10-01' },
        '2026-11-16',
      ),
    ).toEqual({
      state: 'not_in_force',
      on: '2026-11-16',
      from: '2000-01-01',
      until: '2016-10-01',
      until_undetermined: false,
    });
    expect(
      statusValue(
        { inForce: true, reason: 'in_force', from: '2016-10-01', until: null },
        '2026-11-16',
        true,
      ),
    ).toEqual({
      state: 'in_force',
      on: '2026-11-16',
      from: '2016-10-01',
      until: null,
      until_undetermined: true,
    });
    expect(
      statusValue(
        { inForce: false, reason: 'not_yet_in_force', from: '2027-01-01', until: null },
        '2026-11-16',
      ).state,
    ).toBe('not_yet_in_force');
    expect(
      statusValue(
        { inForce: false, reason: 'never_applied', from: '2020-01-01', until: '2019-01-01' },
        '2026-11-16',
      ).state,
    ).toBe('never_applied');
  });
});

describe('format: JSON budgets', () => {
  // First in this file: the function must not have run before (see the comment inside).
  it('sliceForJson: the text ends at nextOffset, also once warmed up on short texts', () => {
    // Node 26.5 (V8 Maglev) cut `text.slice(offset, end)` short at a random point after the loop
    // had run on short texts: the page lost text while `nextOffset` skipped past it.
    for (let i = 0; i < 50; i++) sliceForJson('Texte officiel.', 0, 39_000);
    const text = Array.from(
      { length: 3400 },
      (_, i) => `Alinéa ${i} : texte "officiel" de l'article, cité tel quel.`,
    ).join('\n');
    let offset = 0;
    let joined = '';
    for (;;) {
      const s = sliceForJson(text, offset, 38_965);
      expect(s.text).toHaveLength((s.nextOffset ?? text.length) - offset);
      joined += s.text;
      if (s.nextOffset === null) break;
      offset = s.nextOffset;
    }
    expect(joined).toBe(text);
  });

  it('sliceForJson keeps every escaped page within room and chains without loss', () => {
    const text = 'a"\n\\é'.repeat(5000);
    let offset = 0;
    let joined = '';
    while (true) {
      const s = sliceForJson(text, offset, 10_000);
      expect(JSON.stringify(s.text).length - 2).toBeLessThanOrEqual(10_000);
      if (s.nextOffset !== null) {
        expect(JSON.stringify(text.slice(offset, s.nextOffset + 1)).length - 2).toBeGreaterThan(
          10_000,
        );
      }
      joined += s.text;
      if (s.nextOffset === null) break;
      offset = s.nextOffset;
    }
    expect(joined).toBe(text);
  });

  it('sliceForJson never splits a surrogate pair and always advances', () => {
    const text = '𝔸'.repeat(3);
    expect(sliceForJson(text, 0, 3)).toEqual({ text: '𝔸', nextOffset: 2 });
    expect(sliceForJson(text, 2, 1)).toEqual({ text: '𝔸', nextOffset: 4 });
    expect(sliceForJson(text, 4, 100)).toEqual({ text: '𝔸', nextOffset: null });
  });

  it('listPage past the end is an empty page, not an error', () => {
    expect(listPage([1, 2, 3], 3, () => 1, { maxItems: 2, budget: 100 })).toMatchObject({
      items: [],
      total: 3,
      pageCount: 2,
      hasMore: false,
      pastEnd: true,
    });
  });
});

describe('toolError', () => {
  it('toolError: deadline, one sentence, seconds from the deadline', async () => {
    const signal = callSignal(undefined, 1);
    await new Promise((r) => setTimeout(r, 10));
    const r = toolError(new DOMException('t', 'TimeoutError'), {
      source: 'legifrance',
      request: { tool: 't' },
      signal,
      deadlineMs: 45_000,
    });
    expect(expectToolError(r, 'deadline')).toEqual({
      source: 'Légifrance',
      outcome: 'error',
      error: {
        kind: 'deadline',
        message: 'Légifrance did not answer within 45 s. Try again in a moment.',
      },
      request: { tool: 't' },
      vigueur_version: VERSION,
    });
  });

  it('toolError: an HTTP failure carries retrieved, the hint joins the message', () => {
    const err = new VigueurError('quota_exceeded', 'Légifrance: rate limit reached (HTTP 429)', {
      source: 'legifrance',
      status: 429,
      retryAfterSeconds: 3,
    });
    const e = expectToolError(
      toolError(err, { source: 'legifrance', request: { tool: 't' } }),
      'quota_exceeded',
    );
    expect(e.error.message).toBe(
      'Légifrance: rate limit reached (HTTP 429) PISTE quota reached. Retry in about 3 s.',
    );
    expect(Object.keys(e)).toEqual([
      'source',
      'outcome',
      'error',
      'request',
      'retrieved',
      'vigueur_version',
    ]);
  });

  it('toolError: retrieved reads the injected clock', () => {
    const err = new VigueurError('forbidden', 'Légifrance: access refused (HTTP 403)', {
      source: 'legifrance',
      status: 403,
    });
    const e = expectToolError(
      toolError(err, { source: 'legifrance', request: { tool: 't' }, now: NOW }),
      'forbidden',
    );
    expect(e.retrieved).toBe('2026-11-16T10:42:07Z');
  });

  it('toolError: a non-Vigueur error is "unexpected", no retrieved', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const e = expectToolError(
      toolError(new Error('boom'), { source: 'piste', request: { tool: 'vigueur_status' } }),
      'unexpected',
    );
    expect(e).toMatchObject({
      source: 'PISTE',
      error: { message: 'Unexpected error: boom. Call vigueur_status to check the setup.' },
    });
    expect('retrieved' in e).toBe(false);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Error: boom'));
    stderr.mockRestore();
  });
});
