import * as z from 'zod/v4';
import {
  type AnswerBody,
  answerSchema,
  chamberSchema,
  dateSchema,
  decidedSchema,
  decisionTitleSchema,
  ecliSchema,
  formationSchema,
  judilibreIdSchema,
  judilibreJurisdictionSchema,
  judilibreLinkSchema,
  locationSchema,
  nextSchema,
  numbersSchema,
  partSchema,
  pointerSchema,
  publicationListSchema,
  solutionSchema,
} from '../envelope.js';

export const TOOL = 'judilibre_get_decision';
export const SOURCE = 'Judilibre';

const foundBranch = answerSchema(SOURCE, 'found', {
  id: judilibreIdSchema,
  ecli: ecliSchema,
  link: judilibreLinkSchema,
  title: decisionTitleSchema.describe(
    'Court, chamber, decision date, numbers and ECLI as one line; cut to 300 characters.',
  ),
  jurisdiction: judilibreJurisdictionSchema,
  location: locationSchema,
  chamber: chamberSchema,
  decided: decidedSchema,
  numbers: numbersSchema,
  formation: formationSchema,
  publication: publicationListSchema,
  solution: solutionSchema.describe(
    "Outcome of the decision: the last step's full label when Judilibre gives one, else its outcome label or text; null when not given.",
  ),
  source_updated: dateSchema
    .nullable()
    .describe('When Judilibre last updated the decision; null when not given.'),
  attacked: z
    .object({
      title: z
        .string()
        .describe('The attacked decision, court and chamber as Judilibre gives them.'),
      number: z.string().nullable().describe('Its number; null when not given.'),
      decided: dateSchema.nullable().describe('Its date; null when not given.'),
      read_with: pointerSchema
        .nullable()
        .describe('The tool call that returns it when Judilibre holds it; null otherwise.'),
    })
    .nullable()
    .describe('The decision attacked, when the source states it; null otherwise.'),
  summary: z
    .string()
    .nullable()
    .describe(
      "The Cour de cassation's summary (sommaire), cut when long; null when there is none and on every page after the first.",
    ),
  titles: z
    .array(z.string())
    .describe(
      'The titles of the summary, each cut when long; empty on every page after the first.',
    ),
  visa: z
    .array(z.string())
    .describe(
      'The texts the decision is based on, each cut when long; empty on every page after the first.',
    ),
  rapprochements: z
    .array(z.string())
    .describe('Related decisions, each cut when long; empty on every page after the first.'),
  files: z
    .array(z.object({ name: z.string(), type: z.string(), link: z.string().nullable() }))
    .describe(
      "Documents attached to the decision; empty on every page after the first. link is null when the source's link does not point to Judilibre.",
    ),
  zones: z.array(z.string()).describe('The zones the source marks in the text; empty when none.'),
  zone: z
    .string()
    .nullable()
    .describe('The zone the text shown is limited to; null when it is the whole decision.'),
  part: partSchema.nullable().describe('The characters of the text shown; null when it is whole.'),
  next: nextSchema,
  text: z
    .string()
    .describe(
      'The text of the decision verbatim (the part shown); names are pseudonymised by the source.',
    ),
  other_source: pointerSchema
    .nullable()
    .describe(
      "The call that searches Légifrance for this decision's ECLI; given on the last page of a Cour de cassation decision with an ECLI, else null.",
    ),
});

const notFoundBranch = answerSchema(SOURCE, 'not_found', {
  id: z.string().describe('The decision id looked up.'),
});

export const getDecisionOutput = z.discriminatedUnion('outcome', [foundBranch, notFoundBranch]);

export type GetDecisionAnswer = AnswerBody<z.input<typeof getDecisionOutput>>;
export type FoundAnswer = AnswerBody<z.input<typeof foundBranch>>;
