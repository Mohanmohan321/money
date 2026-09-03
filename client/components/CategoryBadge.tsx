import {
  Clapperboard,
  Coffee,
  Hamburger as Burger,
  HeartPulse,
  Plane,
  ReceiptText,
  ShoppingBag,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

import type { SpendingCategory } from '../../shared/contracts';

interface CategoryPresentation {
  label: string;
  icon: LucideIcon;
}

export const categoryPresentation = {
  food: { label: 'Food', icon: Burger },
  travel: { label: 'Travel', icon: Plane },
  shopping: { label: 'Shopping', icon: ShoppingBag },
  coffee: { label: 'Coffee', icon: Coffee },
  entertainment: { label: 'Entertainment', icon: Clapperboard },
  health: { label: 'Health', icon: HeartPulse },
  bills: { label: 'Bills', icon: ReceiptText },
  other: { label: 'Other', icon: WalletCards },
} satisfies Record<SpendingCategory, CategoryPresentation>;

interface CategoryBadgeProps {
  category: SpendingCategory;
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  const { icon: Icon, label } = categoryPresentation[category];

  return (
    <span
      className={`category-badge category-${category}`}
      data-testid={`category-${category}`}
    >
      <Icon aria-hidden="true" focusable="false" />
      <span>{label}</span>
    </span>
  );
}
