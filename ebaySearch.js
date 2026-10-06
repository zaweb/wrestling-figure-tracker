// eBay Browse API condition IDs. ALL omits the condition filter.
export const CONDITIONS = [
  { id: 'ALL', label: 'All' },
  { id: '1000', label: 'New' },
  { id: '1500', label: 'New other' },
  { id: '3000', label: 'Used' },
  { id: '4000', label: 'Very Good' },
  { id: '5000', label: 'Good' },
  { id: '6000', label: 'Acceptable' },
];

const CONDITION_IDS = new Set(CONDITIONS.map((condition) => condition.id));

export function normalizeCondition(value) {
  if (CONDITION_IDS.has(value)) return value;
  return 'ALL';
}

export function ebaySearchFilter(condition) {
  const buyingOptions = 'buyingOptions:{FIXED_PRICE}';
  const id = normalizeCondition(condition);
  if (id === 'ALL') return buyingOptions;
  return `${buyingOptions},conditionIds:{${id}}`;
}
