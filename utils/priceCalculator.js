// utils/priceCalculator.js
export function calculatePriceMetrics(listings) {
  const prices = listings
    .map((item) => parseFloat(item.price?.value || item.price))
    .filter((price) => !isNaN(price) && price > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) return null;

  const minPrice = prices[0];
  const maxPrice = prices[prices.length - 1];
  const sum = prices.reduce((acc, curr) => acc + curr, 0);
  const avgPrice = parseFloat((sum / prices.length).toFixed(2));

  const mid = Math.floor(prices.length / 2);
  const medianPrice =
    prices.length % 2 !== 0
      ? prices[mid]
      : parseFloat(((prices[mid - 1] + prices[mid]) / 2).toFixed(2));

  return {
    listingCount: prices.length,
    minPrice,
    maxPrice,
    avgPrice,
    medianPrice,
  };
}