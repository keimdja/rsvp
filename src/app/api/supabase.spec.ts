import { ApiError } from './models';
import { unwrap } from './supabase';

const failure = (message: string, code?: string) => ({ data: null, error: { message, code } });
const codeOf = (response: ReturnType<typeof failure>) => {
  try {
    unwrap(response);
  } catch (error) {
    return error instanceof ApiError ? error.code : 'not an ApiError';
  }
  return 'did not throw';
};

describe('unwrap', () => {
  it('returns the data of a successful call', () => {
    expect(unwrap({ data: [1, 2], error: null })).toEqual([1, 2]);
  });

  it('turns named backend errors into their code', () => {
    expect(codeOf(failure('slug_taken', 'P0001'))).toBe('slug_taken');
    expect(codeOf(failure('not_authorized', '42501'))).toBe('not_authorized');
    expect(codeOf(failure('event_unavailable', 'P0001'))).toBe('event_unavailable');
  });

  it('groups invalid values, unknown database errors and network failures', () => {
    expect(codeOf(failure('new row violates check constraint "events_title_check"', '23514'))).toBe(
      'invalid_input',
    );
    expect(codeOf(failure('invalid input syntax for type date: "x"', '22007'))).toBe(
      'invalid_input',
    );
    expect(codeOf(failure('could not serialize access', '40001'))).toBe('unknown');
    expect(codeOf(failure('TypeError: Failed to fetch'))).toBe('network');
  });
});
