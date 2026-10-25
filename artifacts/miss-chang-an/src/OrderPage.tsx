import type { Category } from './types/menu';
import QuickOrder from './QuickOrder';

export default function OrderPage({ categories }: { categories: Category[] }) {
  return <QuickOrder categories={categories} />;
}
