import type { IsoDate } from '../../domain/dates.js';
import { invalid, requireIsoDate, todayInParis } from '../input.js';
import { createGetText, type GetTextInput } from './get-text.js';
import type { CallContext, ChangeEntry, LegislationRepository } from './ports.js';
import { resolveCode } from './resolve.js';
import { parseTextRef } from './text-ref.js';

export interface ChangesView {
  /** Decided by the input (`code` vs `text`), never by id prefix. */
  target: 'code' | 'text';
  textTitle: string;
  textId: string;
  since: IsoDate;
  until: IsoDate;
  groups: Array<{ amendingTitle: string; entries: ChangeEntry[] }>;
  /** Entries dated after today: not yet in force. */
  scheduledCount: number;
  undeterminedCount: number;
  detailMissingYears: string[];
  totalEntries: number;
}

const byDateThenNumber = (a: ChangeEntry, b: ChangeEntry) =>
  a.date.localeCompare(b.date) ||
  (a.articleNum ?? '').localeCompare(b.articleNum ?? '', 'fr', { numeric: true });

const FORMS =
  'a LEGITEXT… or JORFTEXT… id, a NOR (e.g. JUSX1234567A), or "<nature> <number>" such as "loi 78-17" or "décret 2019-1088" (natures: loi, loi organique, ordonnance, décret, arrêté)';

function parseTextInput(raw: string): GetTextInput {
  const ref = parseTextRef(raw);
  if (ref === null) throw invalid(`Cannot read "${raw}" as a text. Accepted: ${FORMS}.`);
  return ref;
}

/**
 * Changes to a code or to a law/decree between two dates, grouped by amending text. A text is
 * resolved with `createGetText`; a repealed one still has a change history.
 */
export function createListChanges(
  repo: LegislationRepository,
  opts: { today?: () => IsoDate } = {},
): (
  input: { code?: string; text?: string; since: IsoDate; until?: IsoDate },
  ctx?: CallContext,
) => Promise<ChangesView> {
  const todayOf = opts.today ?? todayInParis;
  const getText = createGetText(repo, { today: todayOf });
  return async (input, ctx) => {
    const today = todayOf();
    const since = requireIsoDate(input.since, 'since');
    const until = input.until === undefined ? today : requireIsoDate(input.until, 'until');
    if (until < since) {
      throw invalid(`"until" (${until}) is before "since" (${since}).`);
    }

    const code = input.code?.trim() || undefined;
    const text = input.text?.trim() || undefined;
    if ((code === undefined) === (text === undefined)) {
      throw invalid('Give exactly one of "code" (a code title) or "text" (a law or decree).');
    }

    let target: ChangesView['target'];
    let subject: { id: string; title: string; cid: string };
    if (code !== undefined) {
      target = 'code';
      const resolved = await resolveCode(repo, code, ctx);
      if (resolved.code === null) {
        const hint =
          resolved.didYouMean.length > 0
            ? ` Did you mean: ${resolved.didYouMean.join('; ')}?`
            : ' Use the exact title of a code, e.g. "Code du travail". For a law or decree, use "text".';
        throw invalid(`Unknown code "${code}".${hint}`);
      }
      subject = { id: resolved.code.id, title: resolved.code.title, cid: resolved.code.id };
    } else {
      target = 'text';
      const res = await getText(parseTextInput(text as string), ctx);
      const list = (items: Array<{ title: string; id: string }>) =>
        items.map((c) => `${c.title} (${c.id})`).join('; ');
      if (res.kind === 'found') {
        subject = {
          id: res.text.record.id,
          title: res.text.record.title,
          cid: res.text.record.cid,
        };
      } else if (res.kind === 'not_found') {
        throw invalid(`No text found for "${res.input}". Check the number, nature or id.`);
      } else if (res.kind === 'ambiguous') {
        throw invalid(
          `"${text}" matches several texts: ${list(res.candidates.map((c) => ({ title: c.title, id: c.textId })))}. Use the LEGITEXT id or the NOR.`,
        );
      } else if (res.kind === 'other_nature') {
        throw invalid(
          `No ${res.input} on Légifrance, but these texts carry the number ${res.number}: ${list(res.candidates.map((c) => ({ title: c.title, id: c.textId })))}. Use the LEGITEXT id of the one you mean.`,
        );
      } else {
        const [only] = res.candidates;
        if (res.candidates.length === 1 && only?.textCid) {
          subject = { id: only.textId, title: only.title, cid: only.textCid };
        } else {
          throw invalid(
            `"${text}" matches ${res.candidates.length === 1 ? 'a text with no usable JORFTEXT id' : 'several texts'} not in force on ${res.asOf}: ${list(res.candidates.map((c) => ({ title: c.title, id: c.textId })))}. Use the JORFTEXT id or the NOR.`,
          );
        }
      }
    }

    const log = await repo.listChanges(subject.cid, since, until, ctx);
    const byTitle = new Map<string, ChangeEntry[]>();
    for (const e of log.entries) {
      const group = byTitle.get(e.amendingTitle);
      if (group) group.push(e);
      else byTitle.set(e.amendingTitle, [e]);
    }
    const groups = [...byTitle.entries()]
      .map(([amendingTitle, entries]) => ({
        amendingTitle,
        entries: entries.sort(byDateThenNumber),
      }))
      .sort(
        (a, b) =>
          (a.entries[0]?.date ?? '').localeCompare(b.entries[0]?.date ?? '') ||
          a.amendingTitle.localeCompare(b.amendingTitle, 'fr'),
      );

    return {
      target,
      textTitle: subject.title,
      textId: subject.id,
      since,
      until,
      groups,
      scheduledCount: log.entries.filter((e) => e.date > today).length,
      undeterminedCount: log.undeterminedCount,
      detailMissingYears: log.detailMissingYears,
      totalEntries: log.entries.length,
    };
  };
}
