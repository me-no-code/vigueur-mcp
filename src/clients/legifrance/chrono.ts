import { type IsoDate, isoDateInParis } from '../../domain/dates.js';
import type { CallContext, ChangeEntry, ChangeLog } from '../../services/legislation/ports.js';
import { VigueurError } from '../../shared/errors.js';
import type { PisteHttp } from '../piste/http.js';
import { asObj, HISTORY_ACTIONS, keyed, list, lookup, optStr, postJson } from './request.js';
import { cleanTitle, parseApiDate, stripIdSuffix } from './wire.js';

const yearOf = (d: IsoDate) => Number.parseInt(d.slice(0, 4), 10);

function mapChanges(body: unknown, from: IsoDate, to: IsoDate): ChangeLog {
  const entries: ChangeEntry[] = [];
  const detailMissingYears: string[] = [];
  let undeterminedCount = 0;
  const [startYear, endYear] = [yearOf(from), yearOf(to)];

  for (const group of list(asObj(body, 'body'), 'regroupements', true)) {
    if (group.detailLoaded !== true) {
      const year = optStr(group, 'title');
      const n = year === null ? Number.NaN : Number.parseInt(year, 10);
      if (year !== null && n >= startYear && n <= endYear) detailMissingYears.push(year);
      continue;
    }
    for (const [key, version] of keyed(group, 'versions')) {
      const when = parseApiDate(key);
      if (when.sentinel === 'undetermined') {
        undeterminedCount++;
        continue;
      }
      if (when.date === null || when.date < from || when.date > to) continue;
      const date = when.date;
      for (const [modifierKey, modifier] of keyed(version, 'articlesModificateurs')) {
        const modifierId = optStr(modifier, 'id') ?? modifierKey;
        for (const [actionKey, action] of keyed(modifier, 'actions')) {
          for (const [, parent] of keyed(action, 'parents')) {
            const sectionName = optStr(parent, 'name');
            for (const [targetKey, target] of keyed(parent, 'articlesCibles')) {
              const num = optStr(target, 'name');
              entries.push({
                date,
                action: lookup(HISTORY_ACTIONS, actionKey, 'other'),
                articleNum: num === null ? null : cleanTitle(num),
                articleId: stripIdSuffix(optStr(target, 'id') ?? targetKey),
                sectionTitle: sectionName === null ? null : cleanTitle(sectionName),
                amendingTitle: cleanTitle(optStr(modifier, 'title') ?? ''),
                amendingArticleId:
                  modifierId === 'UNKNOWN' || modifierId === '' ? null : stripIdSuffix(modifierId),
              });
            }
          }
        }
      }
    }
  }
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { entries, undeterminedCount, detailMissingYears };
}

/** Changes to a code entering into force between `from` and `to`, from `/chrono/textCid`. */
export function listChanges(
  http: PisteHttp,
  codeId: string,
  from: IsoDate,
  to: IsoDate,
  today: Date,
  ctx?: CallContext,
): Promise<ChangeLog> {
  if (from > to) {
    return Promise.reject(new VigueurError('invalid_input', 'from must not be after to.'));
  }
  const body = {
    textCid: codeId,
    dateConsult: isoDateInParis(today),
    startYear: yearOf(from),
    endYear: yearOf(to),
  };
  return postJson(http, '/chrono/textCid', body, ctx, (raw) => mapChanges(raw, from, to));
}
