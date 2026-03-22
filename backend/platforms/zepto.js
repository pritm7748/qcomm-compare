/**
 * Zepto Scraper — Hybrid DOM + Body Text Parsing
 * 
 * Strategy: Try DOM selectors first (product cards — anchor tags wrapping product info),
 * then fall back to improved body text parsing.
 * Scrolls multiple times to load more products.
 */
import { newPage } from '../utils/browser.js';

export const platformInfo = {
    id: 'zepto',
    name: 'Zepto',
    color: '#8B5CF6',
    deliveryTime: '10-15 mins',
    logo: 'https://www.zeptonow.com/favicon.ico',
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

        // Set location cookies
        if (loc.lat && loc.lng) {
            for (const domain of ['.zepto.com', '.zeptonow.com']) {
                await page.setCookie(
                    { name: 'user_lat', value: String(loc.lat), domain },
                    { name: 'user_lng', value: String(loc.lng), domain },
                    { name: 'latitude', value: String(loc.lat), domain },
                    { name: 'longitude', value: String(loc.lng), domain },
                ).catch(() => { });
            }
        }

        // Navigate to search — full multi-word query
        await page.goto(`https://www.zeptonow.com/search?query=${encodeURIComponent(query)}`, {
            waitUntil: 'networkidle2', timeout: 15000,
        }).catch(() => { });
        await new Promise(r => setTimeout(r, 4000));

        // Scroll multiple times to load more products
        for (let i = 0; i < 4; i++) {
            await page.evaluate(() => window.scrollBy(0, 800)).catch(() => { });
            await new Promise(r => setTimeout(r, 1500));
        }

        // Strategy 1: DOM-based extraction
        let products = await page.evaluate(() => {
            const items = [];

            // Zepto product cards: anchor tags with href containing /prn/ (product) or
            // divs that contain both h5 (name) and ₹ (price)
            // Also try: any anchor that has an img and h5 as descendants
            const cards = document.querySelectorAll('a[href*="/prn/"], a[href*="/product/"]');

            for (const card of cards) {
                try {
                    const text = card.innerText || '';
                    if (!text.includes('₹')) continue;

                    // Get name from h5 or first substantial text element
                    const nameEl = card.querySelector('h5, h4, h3');
                    let name = nameEl?.textContent?.trim() || '';

                    // If no h5, try to get name from card text structure
                    if (!name || name.length < 3) {
                        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                        for (const line of lines) {
                            if (line.startsWith('₹') || line === 'ADD' || line === 'OFF') continue;
                            if (line.match(/^\d+%$/) || line.match(/^\d+$/)) continue;
                            if (line.match(/^\d+\s*(ml|l|g|kg|pcs|pack)/i)) continue;
                            if (line.length >= 5 && line.length <= 100 && line.match(/[a-zA-Z]{3,}/)) {
                                name = line; break;
                            }
                        }
                    }
                    if (!name || name.length < 3) continue;

                    // Get prices
                    const priceMatches = [...text.matchAll(/₹\s*(\d+)/g)];
                    if (priceMatches.length === 0) continue;
                    let prices = priceMatches.map(m => parseInt(m[1])).filter(p => p >= 5 && p < 50000);
                    if (prices.length === 0) continue;

                    // Smart price extraction: if min is < 20% of max, it's likely a discount badge
                    let price, mrp;
                    const maxP = Math.max(...prices);
                    prices = prices.sort((a, b) => a - b);
                    if (prices.length > 1 && prices[0] < maxP * 0.2) {
                        // Lowest price is suspiciously low — likely a "Save ₹X" badge
                        price = prices[1]; // Use second-lowest
                    } else {
                        price = prices[0]; // Use lowest
                    }
                    mrp = prices.length > 1 ? maxP : price;

                    // Get quantity from nearby text
                    let quantity = '';
                    const lines = text.split('\n').map(l => l.trim());
                    for (const line of lines) {
                        if (line.match(/^\d+\.?\d*\s*(ml|ltr|l|gm|gms|g|kg|kgs|pcs|pack|pouch|piece|unit)/i) ||
                            line.match(/\d+\s*x\s*\d+/i) ||
                            line.match(/^\d+\s*pack\s*\(/i)) {
                            quantity = line; break;
                        }
                    }

                    // Get image
                    const img = card.querySelector('img');
                    const image = img?.src || '';

                    if (items.find(it => it.name === name)) continue;

                    items.push({ name, price, mrp: mrp > price ? mrp : price, quantity, image });
                } catch (e) { continue; }
            }

            // Also try: broader selector if specific ones miss
            if (items.length < 3) {
                const allCards = document.querySelectorAll('[class*="product"], [class*="Product"]');
                for (const card of allCards) {
                    try {
                        const text = card.innerText || '';
                        if (!text.includes('₹') || text.length > 500 || text.length < 10) continue;

                        const nameEl = card.querySelector('h5, h4, h3');
                        let name = nameEl?.textContent?.trim() || '';
                        if (!name) {
                            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                            for (const line of lines) {
                                if (line.startsWith('₹') || line === 'ADD' || line === 'OFF') continue;
                                if (line.match(/^\d/) && !line.match(/[a-zA-Z]{3,}/)) continue;
                                if (line.length >= 5 && line.length <= 100) { name = line; break; }
                            }
                        }
                        if (!name || name.length < 5 || items.find(it => it.name === name)) continue;

                        let pm = [...text.matchAll(/₹\s*(\d+)/g)].map(m => parseInt(m[1])).filter(p => p >= 5 && p < 50000);
                        if (pm.length === 0) continue;
                        pm = pm.sort((a, b) => a - b);
                        const maxP = Math.max(...pm);
                        const sellingPrice = (pm.length > 1 && pm[0] < maxP * 0.2) ? pm[1] : pm[0];

                        items.push({
                            name, price: sellingPrice,
                            mrp: pm.length > 1 ? maxP : sellingPrice,
                            quantity: '', image: card.querySelector('img')?.src || '',
                        });
                    } catch { continue; }
                }
            }

            return items;
        });

        // Strategy 2: Body text fallback if DOM got too few
        if (products.length < 5) {
            const bodyProducts = await page.evaluate(() => {
                const items = [];
                const text = document.body?.innerText || '';
                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.length < 5 || line.length > 100) continue;
                    if (line.startsWith('₹') || line === 'ADD' || line === 'OFF' || line === 'Sponsored') continue;
                    if (line.match(/^[\d.]+$/) || line.match(/^\(\d/)) continue;
                    if (line.match(/^(Select|Search|Login|Cart|Your|Showing|Deliver)/)) continue;
                    if (!line.match(/[a-zA-Z]{2,}/) || line.split(' ').length < 2) continue;

                    let price = 0, mrp = 0, quantity = '';
                    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
                        if (lines[j].startsWith('₹')) {
                            const m = lines[j].match(/₹(\d+)/);
                            if (m) {
                                const val = parseInt(m[1]);
                                if (val > 0 && val < 50000) {
                                    if (price === 0) price = val;
                                    else if (val > price) mrp = val;
                                }
                            }
                        }
                    }
                    if (price === 0) continue;

                    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 2); j++) {
                        if (lines[j].match(/^\d+\.?\d*\s*(ml|ltr|l|gm|gms|g|kg|kgs|pcs|pack)/i)) {
                            quantity = lines[j]; break;
                        }
                    }

                    if (items.find(it => it.name === line)) continue;
                    items.push({ name: line, price, mrp: mrp > price ? mrp : price, quantity, image: '' });
                }
                return items;
            });

            const existingNames = new Set(products.map(p => p.name.toLowerCase()));
            for (const bp of bodyProducts) {
                if (!existingNames.has(bp.name.toLowerCase())) {
                    products.push(bp);
                    existingNames.add(bp.name.toLowerCase());
                }
            }
        }

        console.log(`[zepto] found ${products.length} products`);

        return {
            products: products.slice(0, 40).map((p, i) => ({
                id: `zepto-${i}`, platform: 'zepto',
                name: p.name, price: p.price, mrp: p.mrp,
                image: p.image || '', quantity: p.quantity || '',
                available: true, deliveryEta: '10-15 min',
                discountPercent: p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0,
                url: '',
            })),
        };
    } catch (err) {
        console.error(`[zepto] search error:`, err.message);
        return { products: [], error: err.message };
    } finally {
        if (page) await page.close().catch(() => { });
    }
}

export function getDeliveryInfo() {
    return {
        deliveryFee: 29, freeDeliveryMinimum: 99, handlingCharge: 2,
        platformFee: 2, smallCartFee: 25, smallCartThreshold: 99,
        estimatedDelivery: '10-15 minutes', surgeMultiplier: 1,
        notes: 'Free delivery on orders above ₹99',
    };
}
