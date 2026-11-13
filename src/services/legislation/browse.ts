import type { IsoDate } from '../../domain/dates.js';
import { statusAt } from '../../domain/status-at.js';
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

export interface BrowseView {
  codeId: string;
  codeTitle: string;
  asOf: IsoDate;
  /** From the code's top-level part down to the node shown (the code itself excluded). */
  breadcrumb: Array<{ cid: string; title: string }>;
  /** The node shown; `null` for the top level of the code. */
  node: { cid: string; title: string } | null;
  children: TocNode[];
  articles: TocArticle[];
  /** Child sections and articles of the node left out as repealed (or similar). */
  hiddenRepealed: number;
}

/** Statuses of content that no longer applies; hidden unless asked for. */
const GONE: ReadonlySet<LegalStatus> = new Set([
  'repealed',
  'annulled',
  'severed',
  'transferred',
  'stillborn',
]);

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
 * The cached table is shared: it is only read here, never modified. Sections are kept by their
 * dates (the root's dates are the consolidated version's, so the root is never filtered);
 * articles carry no dates, so only their status applies. Repealed content is hidden and
 * counted unless `includeRepealed`.
 */
export function createBrowseCode(
  repo: LegislationRepository,
  opts: { today?: () => IsoDate } = {},
): (input: BrowseInput, ctx?: CallContext) => Promise<BrowseView> {
  const today = opts.today ?? todayInParis;
  return async (input, ctx) => {
    const asOf = input.atDate === undefined ? today() : requireIsoDate(input.atDate);
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

    const datedChildren = node.children.filter((c) => statusAt(c, asOf).inForce);
    const children = input.includeRepealed
      ? datedChildren
      : datedChildren.filter((c) => !isGone(c.status));
    const articles = input.includeRepealed
      ? [...node.articles]
      : node.articles.filter((a) => !isGone(a.status));
    const hiddenRepealed =
      datedChildren.length - children.length + (node.articles.length - articles.length);

    return {
      codeId: toc.codeId,
      codeTitle: toc.codeTitle,
      asOf,
      breadcrumb: path.map(({ cid, title }) => ({ cid, title })),
      node: path.length === 0 ? null : { cid: node.cid, title: node.title },
      children,
      articles,
      hiddenRepealed,
    };
  };
}
