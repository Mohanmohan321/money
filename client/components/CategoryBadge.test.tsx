// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Clapperboard,
  Coffee,
  Hamburger,
  HeartPulse,
  Plane,
  ReceiptText,
  ShoppingBag,
  WalletCards,
} from 'lucide-react';

import type { SpendingCategory } from '../../shared/contracts';
import { CategoryBadge, categoryPresentation } from './CategoryBadge';

afterEach(cleanup);

const categories: ReadonlyArray<readonly [SpendingCategory, string]> = [
  ['food', 'Food'],
  ['travel', 'Travel'],
  ['shopping', 'Shopping'],
  ['coffee', 'Coffee'],
  ['entertainment', 'Entertainment'],
  ['health', 'Health'],
  ['bills', 'Bills'],
  ['other', 'Other'],
];

const categoryIcons = [
  ['food', Hamburger],
  ['travel', Plane],
  ['shopping', ShoppingBag],
  ['coffee', Coffee],
  ['entertainment', Clapperboard],
  ['health', HeartPulse],
  ['bills', ReceiptText],
  ['other', WalletCards],
] as const;

describe('CategoryBadge', () => {
  it.each(categories)('renders %s as an icon and accessible visible label', (category, label) => {
    const { container } = render(<CategoryBadge category={category} />);

    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByTestId(`category-${category}`)).toHaveClass(
      'category-badge',
      `category-${category}`,
    );
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('provides one presentation entry for every spending category', () => {
    expect(Object.keys(categoryPresentation)).toEqual(categories.map(([category]) => category));
  });

  it.each(categoryIcons)('maps %s to its specified Lucide icon', (category, icon) => {
    expect(categoryPresentation[category].icon).toBe(icon);
  });
});
