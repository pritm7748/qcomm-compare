/**
 * Amazon Now Scraper — Puppeteer-based
 * Amazon Now is Amazon's quick commerce (minutes delivery), distinct from Amazon Fresh.
 * Uses DOM-based extraction from structured search result cards.
 */
import { newPage } from '../utils/browser.js';

export const platformInfo = {
    id: 'amazon_now',
    name: 'Amazon Now',
    color: '#FF9900',
    deliveryTime: '10-20 mins',
    logo: 'https://www.amazon.in/favicon.ico',
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

        // Amazon search with grocery/nowstore category filter
        const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(query)}&i=nowstore`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        if (loc.pincode) {
            await page.setCookie(
                { name: 'ubid-acbin', value: 'random-session', domain: '.amazon.in' },
            );
        }

        await page.waitForSelector('[data-component-type="s-search-result"], [class*="s-result-item"]', { timeout: 8000 }).catch(() => { });
        await new Promise(r => setTimeout(r, 3000));

        // Scroll for more products
        for (let i = 0; i < 4; i++) {
            await page.evaluate(() => window.scrollBy(0, 800)).catch(() => { });
            await new Promise(r => setTimeout(r, 1500));
        }

        const products = await page.evaluate(() => {
            const items = [];

            const cards = document.querySelectorAll('[data-component-type="s-search-result"], .s-result-item[data-asin]');
            for (const card of cards) {
                try {
                    // ── Name extraction: try multiple selectors for full product title ──
                    let name = '';

                    // Strategy 1: Full title from h2 > a (the full clickable title)
                    const h2Link = card.querySelector('h2 a');
                    if (h2Link) {
                        name = h2Link.textContent?.trim() || '';
                    }

                    // Strategy 2: aria-label on h2 or its child
                    if (!name || name.length < 5) {
                        const h2 = card.querySelector('h2');
                        if (h2) {
                            name = h2.textContent?.trim() || '';
                        }
                    }

                    // Strategy 3: title attribute or alternate text elements
                    if (!name || name.length < 5) {
                        const titleEl = card.querySelector('[class*="a-size-base-plus"], [class*="a-size-medium"], .a-text-normal');
                        if (titleEl) name = titleEl.textContent?.trim() || '';
                    }

                    // Strategy 4: img alt text as fallback (often has full name)
                    if (!name || name.length < 5) {
                        const img = card.querySelector('.s-image, img[data-image-latency]');
                        if (img?.alt) name = img.alt.trim();
                    }

                    if (!name || name.length < 5) continue;

                    // ── Price extraction ──
                    // Try the main price selector
                    const priceEl = card.querySelector('.a-price:not(.a-text-price) .a-offscreen');
                    let priceText = priceEl?.textContent?.trim() || '';
                    priceText = priceText.replace(/[₹,\s]/g, '');
                    let price = parseInt(priceText);

                    // Fallback: .a-price-whole
                    if (!price) {
                        const wholeEl = card.querySelector('.a-price:not(.a-text-price) .a-price-whole');
                        if (wholeEl) {
                            price = parseInt(wholeEl.textContent.replace(/[,.\s]/g, ''));
                        }
                    }

                    // Fallback: any ₹ in card text
                    if (!price) {
                        const cardText = card.textContent || '';
                        const pm = cardText.match(/₹\s*([\d,]+)/);
                        if (pm) price = parseInt(pm[1].replace(/,/g, ''));
                    }

                    if (!price || price < 5 || price > 50000) continue;

                    // ── MRP extraction ──
                    const mrpEl = card.querySelector('.a-price.a-text-price .a-offscreen');
                    let mrpText = mrpEl?.textContent?.trim() || '';
                    mrpText = mrpText.replace(/[₹,\s]/g, '');
                    const mrp = parseInt(mrpText) || price;

                    // ── Image ──
                    const imgEl = card.querySelector('.s-image, img[data-image-latency="s-product-image"]');
                    const image = imgEl?.src || '';

                    // ── Link ──
                    const linkEl = card.querySelector('h2 a, a.a-link-normal[href*="/dp/"]');
                    const url = linkEl?.href || '';

                    // ── Quantity extraction from name ──
                    let quantity = '';
                    const qtyMatch = name.match(/(\d+\.?\d*\s*(ml|ltr|l|gm|gms|g|kg|kgs|pcs|pack|piece|litre|liter|count))\b/i);
                    if (qtyMatch) quantity = qtyMatch[1];

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

                    if (name.length < 5) continue;
                    if (items.find(i => i.name === name)) continue;

                    items.push({
                        name: name.substring(0, 120),
                        price,
                        mrp: mrp > price ? mrp : price,
                        image,
                        quantity,
                        url,
                    });
                } catch (e) { continue; }
            }
            return items;
        });

        console.log(`[amazon_now] found ${products.length} products`);

        return {
            products: products.slice(0, 40).map((p, i) => ({
                id: `amznow-${i}`,
                platform: 'amazon_now',
                name: p.name,
                price: p.price,
                mrp: p.mrp,
                image: p.image,
                quantity: p.quantity,
                available: true,
                deliveryEta: '10-20 min',
                discountPercent: p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0,
                url: p.url,
            })),
        };
    } catch (err) {
        console.error(`[amazon_now] search error:`, err.message);
        return { products: [], error: err.message };
    } finally {
        if (page) await page.close().catch(() => { });
    }
}

export function getDeliveryInfo(location) {
    return {
        deliveryFee: 29,
        freeDeliveryMinimum: 199,
        handlingCharge: 0,
        platformFee: 0,
        smallCartFee: 0,
        smallCartThreshold: 0,
        estimatedDelivery: '10-20 minutes',
        surgeMultiplier: 1,
        notes: 'Amazon Now — quick commerce delivery in minutes',
    };
}
