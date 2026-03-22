/**
 * JioMart Scraper — Puppeteer-based
 * Uses DOM selectors for structured product card extraction.
 * Scrolls to load more products.
 */
import { newPage } from '../utils/browser.js';

export const platformInfo = {
    id: 'jiomart',
    name: 'JioMart',
    color: '#0A3D80',
    deliveryTime: '15-30 mins',
    logo: 'https://www.jiomart.com/favicon.ico',
};

let locationContext = {};

export async function setLocation(lat, lng, address, pincode) {
    locationContext = { lat, lng, address, pincode };
    return { success: true };
}

export async function search(query, location) {
    const loc = location || locationContext;
    let page;
    try {
        page = await newPage();

        if (loc.pincode) {
            await page.setCookie(
                { name: 'pincode', value: String(loc.pincode), domain: '.jiomart.com' },
            );
        }

        const searchUrl = `https://www.jiomart.com/search/${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => { });

        await page.waitForSelector('[class*="product"], [class*="Product"], [class*="plp-card"], a[href*="/p/"]', { timeout: 12000 }).catch(() => { });
        await new Promise(r => setTimeout(r, 4000));

        // Scroll multiple times for more products
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => window.scrollBy(0, 800)).catch(() => { });
            await new Promise(r => setTimeout(r, 1500));
        }

        const products = await page.evaluate(() => {
            const items = [];

            const cards = document.querySelectorAll('[class*="plp-card"], [class*="product-card"], [class*="ProductCard"], a[href*="/p/"]');
            for (const card of cards) {
                try {
                    const text = card.textContent || '';
                    const pm = [...text.matchAll(/₹\s*(\d+[\d.]*)/g)];
                    if (pm.length === 0) continue;

                    const prices = pm.map(m => Math.round(parseFloat(m[1]))).filter(p => p >= 5 && p < 50000);
                    if (prices.length === 0) continue;

                    // Smart price: if min < 20% of max, likely a discount badge
                    const sortedPrices = [...prices].sort((a, b) => a - b);
                    const maxP = Math.max(...prices);
                    let price, mrp;
                    if (sortedPrices.length > 1 && sortedPrices[0] < maxP * 0.2) {
                        price = sortedPrices[1];
                    } else {
                        price = sortedPrices[0];
                    }
                    mrp = sortedPrices.length > 1 ? maxP : price;

                    // Try structured name extraction first
                    let name = '';
                    const nameEl = card.querySelector('h3, h4, h2, [class*="name"], [class*="Name"], [class*="title"], [class*="Title"], [class*="clsgetname"]');
                    if (nameEl) {
                        name = nameEl.textContent.trim();
                    }
                    // Fallback: text before first ₹
                    if (!name || name.length < 3) {
                        const priceIdx = text.indexOf('₹');
                        name = priceIdx > 0 ? text.substring(0, priceIdx).replace(/\s+/g, ' ').trim() : '';
                        name = name.replace(/Add$|^(\d+\s*)/gi, '').trim();
                    }

                    // Clean name
                    name = name
                        .replace(/\d[\d.]*\s*Ratings?/gi, '')
                        .replace(/\d[\d.]*\s*Reviews?/gi, '')
                        .replace(/\d+%\s*off/gi, '')
                        .replace(/\bsponsored\b/gi, '')
                        .replace(/\bADD\b/g, '')
                        .replace(/\s+\d{4,}\s*$/g, '')
                        .replace(/\s{2,}/g, ' ')
                        .trim();

                    if (!name || name.length < 5 || price < 5) continue;
                    if (items.find(i => i.name === name)) continue;

                    // Extract quantity
                    let quantity = '';
                    const qtyMatch = name.match(/(\d+\.?\d*\s*(ml|ltr|l|gm|gms|g|kg|kgs|pcs|pack|piece|litre|liter))\b/i);
                    if (qtyMatch) quantity = qtyMatch[1];

                    items.push({
                        name: name.substring(0, 100),
                        price,
                        mrp: mrp > price ? mrp : price,
                        image: card.querySelector('img')?.src || '',
                        quantity,
                        url: card.href || card.querySelector('a')?.href || '',
                    });
                } catch (e) { continue; }
            }
            return items;
        });

        console.log(`[jiomart] found ${products.length} products`);

        return {
            products: products.slice(0, 40).map((p, i) => ({
                id: `jiomart-${i}`,
                platform: 'jiomart',
                name: p.name,
                price: p.price,
                mrp: p.mrp,
                image: p.image,
                quantity: p.quantity,
                available: true,
                deliveryEta: '15-30 min',
                discountPercent: p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0,
                url: p.url,
            })),
        };
    } catch (err) {
        console.error(`[jiomart] search error:`, err.message);
        return { products: [], error: err.message };
    } finally {
        if (page) await page.close().catch(() => { });
    }
}

export function getDeliveryInfo(location) {
    return {
        deliveryFee: 49,
        freeDeliveryMinimum: 199,
        handlingCharge: 0,
        platformFee: 0,
        smallCartFee: 25,
        smallCartThreshold: 99,
        estimatedDelivery: '15-30 minutes',
        surgeMultiplier: 1,
        notes: 'Free delivery on orders above ₹199',
    };
}
