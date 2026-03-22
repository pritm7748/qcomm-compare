/**
 * BigBasket Scraper — Puppeteer-based
 * Uses DOM selectors for structured product card extraction.
 * Scrolls to load more products.
 */
import { newPage } from '../utils/browser.js';

export const platformInfo = {
    id: 'bigbasket',
    name: 'BigBasket',
    color: '#84C225',
    deliveryTime: '10-30 mins',
    logo: 'https://www.bigbasket.com/favicon.ico',
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
                { name: 'bb_pincode', value: String(loc.pincode), domain: '.bigbasket.com' },
            );
        }

        const searchUrl = `https://www.bigbasket.com/ps/?q=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        await page.waitForSelector('[class*="product"], [class*="Product"], [class*="listing"], a[href*="/pd/"]', { timeout: 8000 }).catch(() => { });
        await new Promise(r => setTimeout(r, 3000));

        // Scroll multiple times for lazy-loaded products
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => window.scrollBy(0, 800)).catch(() => { });
            await new Promise(r => setTimeout(r, 1500));
        }

        const products = await page.evaluate(() => {
            const items = [];

            // Helper: clean rating/review noise from product names
            function cleanName(n) {
                return n
                    .replace(/\d[\d.]*\s*Ratings?/gi, '')
                    .replace(/\d[\d.]*\s*Reviews?/gi, '')
                    .replace(/\(\d[\d,.]*\s*(Ratings?|Reviews?)\)/gi, '')
                    .replace(/\d+%\s*off/gi, '')
                    .replace(/\bsponsored\b/gi, '')
                    .replace(/\bADD\b/g, '')
                    .replace(/\s+\d{4,}\s*$/g, '')
                    .replace(/\s+-\s*$/g, '')
                    .replace(/\s{2,}/g, ' ')
                    .trim();
            }

            // Try multiple card selectors
            const cards = document.querySelectorAll('a[href*="/pd/"], [class*="SKUDeck"], [class*="productCard"], [class*="product-deck"]');
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
                    // Try heading elements
                    const nameEl = card.querySelector('h3, h4, h2, [class*="name"], [class*="Name"], [class*="title"], [class*="Title"]');
                    if (nameEl) {
                        name = cleanName(nameEl.textContent.trim());
                    }
                    // Fallback: text before first ₹
                    if (!name || name.length < 3) {
                        const priceIdx = text.indexOf('₹');
                        name = priceIdx > 0 ? text.substring(0, priceIdx).replace(/\s+/g, ' ').trim() : '';
                        name = cleanName(name.replace(/Add$|^(\d+\s*(min|hr)s?\s*)/gi, ''));
                    }

                    if (!name || name.length < 5 || price <= 0) continue;
                    if (items.find(i => i.name === name)) continue;

                    // Extract quantity from name or nearby text
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

        console.log(`[bigbasket] found ${products.length} products`);

        return {
            products: products.slice(0, 40).map((p, i) => ({
                id: `bigbasket-${i}`,
                platform: 'bigbasket',
                name: p.name,
                price: p.price,
                mrp: p.mrp,
                image: p.image,
                quantity: p.quantity,
                available: true,
                deliveryEta: '10-30 min',
                discountPercent: p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0,
                url: p.url,
            })),
        };
    } catch (err) {
        console.error(`[bigbasket] search error:`, err.message);
        return { products: [], error: err.message };
    } finally {
        if (page) await page.close().catch(() => { });
    }
}

export function getDeliveryInfo(location) {
    return {
        deliveryFee: 30,
        freeDeliveryMinimum: 200,
        handlingCharge: 3,
        platformFee: 0,
        smallCartFee: 0,
        smallCartThreshold: 0,
        estimatedDelivery: '10-30 minutes',
        surgeMultiplier: 1,
        notes: 'Free delivery on orders above ₹200',
    };
}
