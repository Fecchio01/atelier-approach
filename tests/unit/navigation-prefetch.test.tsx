import { describe, expect, test, vi } from 'vitest';

const useStateMock = vi.hoisted(() => vi.fn());

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: useStateMock };
});

vi.mock('next/link', () => ({ default: 'a' }));

import { AppNavigationLink } from '../../components/app-navigation-link';

describe('AppNavigationLink prefetch', () => {
  test('fully prefetches a dynamic destination after navigation intent', () => {
    useStateMock.mockReturnValue([true, vi.fn()]);

    const element = AppNavigationLink({ href: '/crm', label: 'Funil' });

    expect(element.props.prefetch).toBe(true);
  });

  test('keeps dynamic routes idle before navigation intent', () => {
    useStateMock.mockReturnValue([false, vi.fn()]);

    const element = AppNavigationLink({ href: '/crm', label: 'Funil' });

    expect(element.props.prefetch).toBe(false);
  });

});
