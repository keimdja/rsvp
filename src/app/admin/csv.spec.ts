import { toCsv } from './csv';

describe('toCsv', () => {
  it('starts with a BOM and uses CRLF line endings', () => {
    expect(
      toCsv([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe('﻿a,b\r\nc,d\r\n');
  });

  it('quotes cells with commas, quotes and line breaks', () => {
    expect(toCsv([['Smith, Jo', 'Said "hi"', 'two\nlines']])).toBe(
      '﻿"Smith, Jo","Said ""hi""","two\nlines"\r\n',
    );
  });

  it('neutralises cells that spreadsheets would run as formulas', () => {
    const csv = toCsv([['=HYPERLINK("x")', '+1', '-2', '@SUM(A1)', '\tx']]);
    expect(csv).toBe(`﻿"'=HYPERLINK(""x"")",'+1,'-2,'@SUM(A1),'\tx\r\n`);
  });

  it('keeps accents and emoji as they are', () => {
    expect(toCsv([['Zoë Lindqvist', '🎉']])).toBe('﻿Zoë Lindqvist,🎉\r\n');
  });
});
