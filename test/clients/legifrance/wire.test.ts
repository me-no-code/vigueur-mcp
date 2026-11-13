import { describe, expect, it } from 'vitest';
import {
  cleanTitle,
  htmlToText,
  parseApiDate,
  stripIdSuffix,
  stripMarks,
} from '../../../src/clients/legifrance/wire.js';

describe('parseApiDate', () => {
  it('converts epoch ms (UTC), negative before 1970', () => {
    expect(parseApiDate(-5231606400000)).toEqual({ date: '1804-03-21', sentinel: 'none' });
  });
  it('maps the open-ended epoch', () => {
    expect(parseApiDate(32472144000000)).toEqual({ date: null, sentinel: 'open_ended' });
  });
  it('keeps the date part of ISO strings with time', () => {
    expect(parseApiDate('2016-10-01T00:00:00.000+0000')).toEqual({
      date: '2016-10-01',
      sentinel: 'none',
    });
  });
  it('parses date-only strings', () => {
    expect(parseApiDate('2016-10-01')).toEqual({ date: '2016-10-01', sentinel: 'none' });
  });
  it('maps 2999-01-01 in both string forms to open_ended', () => {
    const expected = { date: null, sentinel: 'open_ended' };
    expect(parseApiDate('2999-01-01')).toEqual(expected);
    expect(parseApiDate('2999-01-01T00:00:00.000+0000')).toEqual(expected);
  });
  it('maps 2222-02-22 to undetermined in all forms', () => {
    const expected = { date: null, sentinel: 'undetermined' };
    expect(parseApiDate('2222-02-22')).toEqual(expected);
    expect(parseApiDate('2222-02-22T00:00:00.000+0000')).toEqual(expected);
    expect(parseApiDate(Date.UTC(2222, 1, 22))).toEqual(expected);
  });
  it.each([null, undefined, '', 'garbage', {}, '2016-13-45', Number.NaN])(
    'returns none for %j',
    (v) => {
      expect(parseApiDate(v)).toEqual({ date: null, sentinel: 'none' });
    },
  );
});

describe('stripIdSuffix', () => {
  it('removes the _dd-mm-yyyy suffix', () => {
    expect(stripIdSuffix('LEGITEXT000006070721_29-07-2026')).toBe('LEGITEXT000006070721');
    expect(stripIdSuffix('JORFTEXT000032004939_01-01-2999')).toBe('JORFTEXT000032004939');
  });
  it('leaves ids without suffix unchanged', () => {
    expect(stripIdSuffix('LEGIARTI000006419280')).toBe('LEGIARTI000006419280');
  });
});

describe('stripMarks', () => {
  it('removes highlight tags', () => {
    expect(stripMarks('Livre II (inspection du <mark>travail</mark>)')).toBe(
      'Livre II (inspection du travail)',
    );
  });
});

describe('cleanTitle', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanTitle('Section 3 : La preuve par présomption judiciaire \r\n\r\n')).toBe(
      'Section 3 : La preuve par présomption judiciaire',
    );
    expect(cleanTitle('a \r\n b   c')).toBe('a b c');
  });
  it('decodes entities', () => {
    expect(cleanTitle('Titre IV &gt; Chapitre II')).toBe('Titre IV > Chapitre II');
  });
});

describe('htmlToText', () => {
  it('takes linear time on unclosed tags (upstream text is untrusted)', () => {
    // 40 000 characters of "<p " took about 2 s with a scan to the end of the text per "<".
    const start = performance.now();
    htmlToText('<p '.repeat(13_400));
    htmlToText('<td x'.repeat(8_000));
    expect(performance.now() - start).toBeLessThan(300);
  });

  it('turns paragraphs into lines and drops links keeping text', () => {
    expect(
      htmlToText(
        '<p>1° Premier ;</p><p>2° Voir <a href="/affichCodeArticle.do?cidTexte=X&amp;idArticle=Y">l\'article L. 1</a>.</p>',
      ),
    ).toBe("1° Premier ;\n2° Voir l'article L. 1.");
  });
  it('handles BR variants case-insensitively', () => {
    expect(htmlToText('Ligne<BR></BR>suivante')).toBe('Ligne\nsuivante');
    expect(htmlToText('a<br/>b<br />c')).toBe('a\nb\nc');
  });
  it('decodes entities', () => {
    expect(
      htmlToText('a&nbsp;b &amp; &lt;c&gt; &quot;d&quot; &#39;e&#39; &#233; &#xe9; &apos;'),
    ).toBe("a b & <c> \"d\" 'e' é é '");
  });
  it('trims lines and limits blank lines', () => {
    const out = htmlToText('<div>  a  </div>\n\n\n\n\n<p> b </p>');
    expect(out).toBe('a\n\nb');
    expect(htmlToText('a<p></p><p></p>b')).toBe('a\nb');
    for (const line of out.split('\n')) expect(line).toBe(line.trim());
    expect(out).not.toMatch(/\n{3,}/);
  });
  it('keeps unknown entities as is', () => {
    expect(htmlToText('a &foo; b')).toBe('a &foo; b');
  });
  it('keeps table cells apart: " | " between the cells of a row, one line per row', () => {
    expect(
      htmlToText(
        '<p>Barème :</p><table border="1"><tbody><tr><th>Article</th><th>Montant</th></tr><tr><td align="center">L. 123</td><td align="center">1 500 €</td></tr></tbody></table><p>Fin.</p>',
      ),
    ).toBe('Barème :\nArticle | Montant\nL. 123 | 1 500 €\nFin.');
  });
  it('a cell separator also follows an empty cell or one wrapped in a paragraph, never ends a row', () => {
    expect(
      htmlToText(
        '<table><tr><th></th><th colspan="2">Délais</th></tr><tr>  <td><p>Moins de 8 jours</p></td>\n  <td> <p>24 heures</p> </td></tr></table>',
      ),
    ).toBe('| Délais\nMoins de 8 jours | 24 heures');
  });
  it('puts each list item on its own line, prefixed "- "', () => {
    expect(
      htmlToText(
        '<p>Sont exclus :</p><ul><li>les mineurs ;</li><li><p>les majeurs protégés.</p></li></ul><p>Suite.</p>',
      ),
    ).toBe('Sont exclus :\n- les mineurs ;\n- les majeurs protégés.\nSuite.');
  });
  it('a run of empty paragraphs holding a line break is one blank line', () => {
    expect(
      htmlToText(
        '<p>Premier alinéa.</p><p><br></p><p><br/></p><p align="left"> <br></br> </p><p>Second alinéa.</p>',
      ),
    ).toBe('Premier alinéa.\n\nSecond alinéa.');
  });
});
