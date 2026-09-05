import axios from 'axios';
import { extractAmazonProduct } from './amazon.js';
import { extractFlipkartProduct } from './flipkart.js';
import { extractMyntraProduct } from './myntra.js';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
];

export function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Detects the e-commerce platform from a URL string.
 * @param {string} url 
 * @returns {'amazon'|'flipkart'|'myntra'|null}
 */
export function detectPlatform(url) {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes('amazon.in') || lower.includes('amazon.com')) return 'amazon';
  if (lower.includes('flipkart.com')) return 'flipkart';
  if (lower.includes('myntra.com')) return 'myntra';
  return null;
}

/**
 * Builds authentic browser headers for scraping to avoid anti-bot flags.
 */
export function getBrowserHeaders() {
  const ua = getRandomUserAgent();
  return {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };
}

/**
 * Fetches and parses a product page from Amazon, Flipkart, or Myntra.
 * @param {string} url 
 * @param {string} [platform] 
 * @returns {Promise<Object>} Extracted product details
 */
export async function scrapeProduct(url, platform) {
  const targetPlatform = platform || detectPlatform(url);
  if (!targetPlatform) {
    throw new Error(`Unsupported e-commerce platform for URL: ${url}`);
  }

  const response = await axios.get(url, {
    headers: getBrowserHeaders(),
    timeout: 15000,
    maxRedirects: 5,
    validateStatus: (status) => status < 400,
  });

  const html = response.data;

  switch (targetPlatform) {
    case 'amazon':
      return extractAmazonProduct(html, url);
    case 'flipkart':
      return extractFlipkartProduct(html, url);
    case 'myntra':
      return extractMyntraProduct(html, url);
    default:
      throw new Error(`No parser registered for platform: ${targetPlatform}`);
  }
}
