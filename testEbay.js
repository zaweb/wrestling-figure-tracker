// testEbay.js
import { EBAY_API_BASE, EBAY_ENV, getEbayAppToken } from './ebayAuth.js';

console.log('--- Configuration Check ---');
console.log('Target Environment:', EBAY_ENV);
console.log('API base:', EBAY_API_BASE);

async function testConnection() {
  try {
    console.log(`\n1. Fetching token from: ${EBAY_API_BASE}/identity/v1/oauth2/token...`);
    const token = await getEbayAppToken();
    console.log('Token successfully generated!');
    console.log(`Token prefix: ${token.slice(0, 20)}...`);

    console.log(`\n2. Querying Browse API at: ${EBAY_API_BASE}/buy/browse/v1/item_summary/search...`);
    const searchUrl = `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?q=Cody+Rhodes&limit=3`;

    const searchRes = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Accept': 'application/json',
      },
    });

    const searchData = await searchRes.json();

    if (!searchRes.ok) {
      console.error('Browse API Error:', searchData);
      return;
    }

    console.log('\n--- SUCCESS! ---');
    console.log(`Total items found: ${searchData.total || 0}`);
    if (searchData.itemSummaries) {
      console.log('Sample item:', searchData.itemSummaries[0]?.title);
      console.log('Price:', searchData.itemSummaries[0]?.price);
    }
  } catch (err) {
    console.error('Execution error:', err.message);
  }
}

testConnection();