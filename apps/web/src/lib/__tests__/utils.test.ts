import { cn } from '@/lib/utils';

describe('cn', () => {
  it('returns an empty string for no inputs', () => {
    expect(cn()).toBe('');
  });

  it('returns a single class name', () => {
    expect(cn('class1')).toBe('class1');
  });

  it('returns multiple class names', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });
});
