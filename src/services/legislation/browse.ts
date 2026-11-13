import type { IsoDate } from '../../domain/dates.js';
import { type StatusAt, statusAt } from '../../domain/status-at.js';
import type { LegalStatus } from '../../domain/versions.js';
import type { CallContext, LegislationRepository, TocArticle, TocNode } from './ports.js';
import { invalid, requireIsoDate, resolveCode, todayInParis } from './resolve.js';

export interface BrowseInput {
  code: string;
  /** A section's cid (from an earlier browse); absent: the top level of the code. */
  sectionCid?: string;
  atDate?: IsoDate;
  includeRepealed?: boolean;
}

/** A child section of the node shown, with what its dates say about `asOf`. */
export interface BrowseSection {
  /** A subtree of the client's cached table, shared by reference: read it, never modify it. */
  section: TocNode;
  /** From the section's dates alone (a still-born section never applied); never from its label. */
  force: StatusAt;
}

export interface BrowseView {
  codeId: string;
  codeTitle: string;
  asOf: IsoDate;
  /**
   * `asOf` is today in Paris. Article labels are Légifrance's current ones and the table gives
   * articles no dates, so they are filtered by label only when this is true.
   */
  asOfIsToday: boolean;
  /** From the code's top-level part down to the node shown (the code itself excluded). */
  breadcrumb: Array<{ cid: string; title: string }>;
  /** The node shown; `null` for the top level of the code. */
  node: { cid: string; title: string } | null;
  children: BrowseSection[];
  articles: TocArticle[];
  /** Child sections and articles of the node left out as not in force on `asOf`. */
  hiddenNotInForce: number;
}

/** Article statuses of content that no longer applies today; hidden unless asked for. */
const GONE: ReadonlySet<LegalStatus> = new Set([
  'repealed',
  'annulled',
  'severed',
  'transferred',
  'stillborn',
]);

/** An article label saying it no longer applies (today): hidden today unless asked for. */
const isGone = (status: LegalStatus) => GONE.has(status);

/** The path from `from`'s children down to `cid` (`from` excluded), or `null` when absent. */
function pathTo(from: TocNode, cid: string): TocNode[] | null {
  for (const child of from.children) {
    if (child.cid === cid) return [child];
    const deeper = pathTo(child, cid);
    if (deeper !== null) return [child, ...deeper];
  }
  return null;
}

/**
 * Walks a code's table of contents one level at a time, as of a date (default: today in Paris).
 * The cached table is shared: it is only read here, never modified.
 * - Sections are judged by their dates alone (a still-born section never applied,
 *   an unknown start counts as "since the beginning"): a label never hides a date-valid section.
 *   The root's dates are the consolidated version's, so the root is never filtered.
 * - Articles carry no dates in the table, only Légifrance's current label: it is used to hide
 *   repealed articles when `asOf` is today; on any other date every article is kept.
 * What is hidden is counted; `includeRepealed` hides nothing.
 */
export function createBrowseCode(
  repo: LegislationRepository,
  opts: { today?: () => IsoDate } = {},
): (input: BrowseInput, ctx?: CallContext) => Promise<BrowseView> {
  const today = opts.today ?? todayInParis;
  return async (input, ctx) => {
    const now = today();
    const asOf = input.atDate === undefined ? now : requireIsoDate(input.atDate);
    const resolved = await resolveCode(repo, input.code, ctx);
    if (resolved.code === null) {
      const hint =
        resolved.didYouMean.length > 0 ? ` Did you mean: ${resolved.didYouMean.join('; ')}?` : '';
      throw invalid(`No code is titled "${input.code}".${hint}`);
    }
    const toc = await repo.getCodeToc(resolved.code.id, asOf, ctx);

    let path: TocNode[] = [];
    if (input.sectionCid !== undefined) {
      const found = pathTo(toc.root, input.sectionCid);
      if (found === null) {
        throw invalid(
          `"${input.sectionCid}" is not a section of ${toc.codeTitle} on ${asOf}. Browse the code without a section to list its top-level parts.`,
        );
      }
      path = found;
    }
    const node = path.at(-1) ?? toc.root;
    const asOfIsToday = asOf === now;
    const showAll = input.includeRepealed === true;

    const dated = node.children.map((section) => ({ section, force: statusAt(section, asOf) }));
    const children = showAll ? dated : dated.filter((c) => c.force.inForce);
    const articles =
      showAll || !asOfIsToday ? [...node.articles] : node.articles.filter((a) => !isGone(a.status));

    return {
      codeId: toc.codeId,
      codeTitle: toc.codeTitle,
      asOf,
      asOfIsToday,
      breadcrumb: path.map(({ cid, title }) => ({ cid, title })),
      node: path.length === 0 ? null : { cid: node.cid, title: node.title },
      children,
      articles,
      hiddenNotInForce: dated.length - children.length + (node.articles.length - articles.length),
    };
  };
}
