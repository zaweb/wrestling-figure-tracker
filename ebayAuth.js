// ebayAuth.js
import dotenv from 'dotenv';
dotenv.config();

const EBAY_HOSTS = {
  sandbox: 'https://api.sandbox.ebay.com',
  production: 'https://api.ebay.com',
};

function resolveEbayConfig(env = process.env) {
  const name = (env.EBAY_ENV || 'sandbox').trim().toLowerCase();
  const apiBase = EBAY_HOSTS[name];
  if (!apiBase) {
    throw new Error(`EBAY_ENV must be "sandbox" or "production" (received "${env.EBAY_ENV}")`);
  }

  const prefix = name === 'production' ? 'EBAY_PRODUCTION' : 'EBAY_SANDBOX';
  const clientId = (env[`${prefix}_CLIENT_ID`] || env.EBAY_CLIENT_ID || '').trim();
  const clientSecret = (env[`${prefix}_CLIENT_SECRET`] || env.EBAY_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    throw new Error(`Missing ${prefix}_CLIENT_ID or ${prefix}_CLIENT_SECRET for EBAY_ENV=${name}`);
  }

  const sandboxKey = clientId.includes('-SBX-') || clientSecret.startsWith('SBX-');
  const productionKey = clientSecret.startsWith('PRD-');
  if (name === 'production' && sandboxKey) {
    throw new Error(
      'EBAY_ENV=production is using sandbox credentials. Set EBAY_PRODUCTION_CLIENT_ID and EBAY_PRODUCTION_CLIENT_SECRET.'
    );
  }
  if (name === 'sandbox' && productionKey) {
    throw new Error(
      'EBAY_ENV=sandbox is using production credentials. Set EBAY_SANDBOX_CLIENT_ID and EBAY_SANDBOX_CLIENT_SECRET.'
    );
  }

  return { env: name, apiBase, clientId, clientSecret };
}

const ebayConfig = resolveEbayConfig();

let cachedToken = null;
let tokenExpiresAt = 0;

export const EBAY_ENV = ebayConfig.env;
export const EBAY_API_BASE = ebayConfig.apiBase;

export async function getEbayAppToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const tokenUrl = `${EBAY_API_BASE}/identity/v1/oauth2/token`;

  const credentials = Buffer.from(
    `${ebayConfig.clientId}:${ebayConfig.clientSecret}`
  ).toString('base64');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to obtain eBay access token: ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}