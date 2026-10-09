import { slugFromInput } from './home';

describe('slugFromInput', () => {
  it('takes the last path segment of a full link', () => {
    expect(slugFromInput('https://keimdja.github.io/rsvp/maya-6', '/rsvp/')).toBe('maya-6');
    expect(slugFromInput('keimdja.github.io/rsvp/maya-6/?utm=wa#top', '/rsvp/')).toBe('maya-6');
    expect(slugFromInput('rsvp/maya-6', '/rsvp/')).toBe('maya-6');
    expect(slugFromInput('http://localhost:4200/maya-6')).toBe('maya-6');
  });

  it('accepts a bare code in any case, with spaces around it', () => {
    expect(slugFromInput('  Eleanor-And-James ')).toBe('eleanor-and-james');
  });

  it('rejects anything that cannot be a slug', () => {
    for (const value of [
      '',
      '   ',
      'https://keimdja.github.io/rsvp/',
      'rsvp',
      'maya 6',
      'ab',
      'émilie',
    ]) {
      expect(slugFromInput(value, '/rsvp/')).toBeNull();
    }
    expect(slugFromInput('https://example.com/rsvp/other/maya-6', '/rsvp/')).toBeNull();
  });
});
