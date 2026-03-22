/**
 * Blinkit Scraper — Hybrid DOM + Body Text Parsing
 * 
 * Strategy: Try DOM selectors first (product cards with role="button"),
 * then fall back to improved body text parsing.
 * Scrolls multiple times to load more products.
 */
import { newPage } from '../utils/browser.js';

export const platformInfo = {
    id: 'blinkit',
    name: 'Blinkit',
    color: '#F7C948',
    deliveryTime: '10-15 mins',
    logo: 'https://blinkit.com/favicon.ico',
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
            await page.setCookie(
                { name: 'gr_1_lat', value: String(loc.lat), domain: '.blinkit.com' },
                { name: 'gr_1_lng', value: String(loc.lng), domain: '.blinkit.com' },
                { name: 'gr_1_locality', value: loc.address ? loc.address.split(',')[0].trim() : '', domain: '.blinkit.com' },
            );
        }

        // Navigate to search — use full query as-is
        await page.goto(`https://blinkit.com/s/?q=${encodeURIComponent(query)}`, {
            waitUntil: 'networkidle2', timeout: 15000,
        }).catch(() => { });
        await new Promise(r => setTimeout(r, 4000));

        // Scroll multiple times to load more products
        for (let i = 0; i < 4; i++) {
            await page.evaluate(() => window.scrollBy(0, 800)).catch(() => { });
            await new Promise(r => setTimeout(r, 1500));
        }

        // Strategy 1: DOM-based extraction (structured, reliable)
        let products = await page.evaluate(() => {
            const items = [];

            // Blinkit uses product cards — div[role="button"] with numeric id
            const cards = document.querySelectorAll('div[role="button"]');
            for (const card of cards) {
                try {
                    const id = card.getAttribute('id');
                    if (!id || !/^\d+$/.test(id)) continue; // Product cards have numeric IDs

                    const text = card.innerText || '';
                    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    if (lines.length < 3) continue;

                    // Find price line (starts with ₹)
                    let price = 0, mrp = 0;
                    let priceIdx = -1;
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].startsWith('₹')) {
                            const m = lines[i].match(/₹(\d+)/);
                            if (m) {
                                const val = parseInt(m[1]);
                                if (val >= 5 && val < 50000) {
                                    if (price === 0) { price = val; priceIdx = i; }
                                    else if (val > price) mrp = val;
                                    else if (val < price) { mrp = price; price = val; priceIdx = i; }
                                }
                            }
                        }
                    }
                    if (price === 0 || priceIdx < 0) continue;

                    // Product name: look for the longest meaningful line near the price
                    // Skip: price lines, delivery times, ADD, Sponsored, percent OFF
                    let name = '';
                    let quantity = '';
                    let deliveryTime = '';

                    for (const line of lines) {
                        if (line.startsWith('₹')) continue;
                        if (line === 'ADD' || line === 'Sponsored' || line === 'OFF') continue;
                        if (line.match(/^\d+%$/)) continue;
                        if (line.match(/^\d+\s*(MIN|MINS|min|mins)/i)) { deliveryTime = line; continue; }
                        if (line.match(/^\d+\.?\d*\s*(ml|ltr|l|gm|gms|g|kg|kgs|pcs|pack|pouch|piece|unit|x)/i) ||
                            line.match(/^\d+\s*x\s*\d+/i)) {
                            quantity = line; continue;
                        }
                        // Product name — the longest remaining text
                        if (line.length > name.length && line.length >= 5 && line.length <= 100) {
                            if (line.match(/[a-zA-Z]{2,}/)) {
                                name = line;
                            }
                        }
                    }

                    if (!name || name.length < 3) continue;
                    if (items.find(it => it.name === name)) continue;

                    // Get image
                    const img = card.querySelector('img');
                    const image = img?.src || '';

                    items.push({
                        name, price, mrp: mrp > price ? mrp : price,
                        quantity, image,
                        deliveryEta: deliveryTime || '10 min',
                    });
                } catch (e) { continue; }
            }
            return items;
        });

        // Strategy 2: If DOM extraction got < 5 products, try improved body text parsing
        if (products.length < 5) {
            const bodyProducts = await page.evaluate(() => {
                const items = [];
                const bodyText = document.body?.innerText || '';
                const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (!line.startsWith('₹')) continue;
                    const priceMatch = line.match(/₹(\d+)/);
                    if (!priceMatch) continue;
                    const price = parseInt(priceMatch[1]);
                    if (price <= 0 || price > 50000) continue;

                    let name = '', quantity = '', deliveryTime = '';
                    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
                        const prev = lines[j];
                        if (prev === 'ADD' || prev === 'Sponsored' || prev === 'OFF') continue;
                        if (prev.startsWith('₹') || prev.match(/^\d+%$/)) continue;
                        if (prev.match(/^\d+\s*(MIN|MINS)/i)) { deliveryTime = prev; continue; }
                        if (prev.match(/^\d+\.?\d*\s*(ml|ltr|l|gm|gms|g|kg|kgs|pcs|pack)/i)) { quantity = prev; continue; }
                        if (prev.length >= 5 && prev.length <= 100 && prev.match(/[a-zA-Z]{2,}/)) {
                            name = prev; break;
                        }
                    }
                    if (!name || name.length < 3) continue;
                    if (items.find(it => it.name === name)) continue;

                    let mrp = price;
                    for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
                        if (lines[j].startsWith('₹')) {
                            const m = lines[j].match(/₹(\d+)/);
                            if (m && parseInt(m[1]) > price) { mrp = parseInt(m[1]); break; }
                        }
                    }

                    items.push({ name, price, mrp: mrp > price ? mrp : price, quantity, image: '', deliveryEta: deliveryTime || '10 min' });
                }
                return items;
            });

            // Merge: add body products not already found via DOM
            const existingNames = new Set(products.map(p => p.name.toLowerCase()));
            for (const bp of bodyProducts) {
                if (!existingNames.has(bp.name.toLowerCase())) {
                    products.push(bp);
                    existingNames.add(bp.name.toLowerCase());
                }
            }
        }

        console.log(`[blinkit] found ${products.length} products`);

        return {
            products: products.slice(0, 40).map((p, i) => ({
                id: `blinkit-${i}`, platform: 'blinkit',
                name: p.name, price: p.price, mrp: p.mrp,
                image: p.image || '', quantity: p.quantity || '',
                available: true,
                deliveryEta: p.deliveryEta || '10-15 min',
                discountPercent: p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0,
                url: '',
            })),
        };
    } catch (err) {
        console.error(`[blinkit] search error:`, err.message);
        return { products: [], error: err.message };
    } finally {
        if (page) await page.close().catch(() => { });
    }
}

export function getDeliveryInfo() {
    return {
        deliveryFee: 25, freeDeliveryMinimum: 199, handlingCharge: 4,
        platformFee: 2, smallCartFee: 0, smallCartThreshold: 0,
        estimatedDelivery: '10-15 minutes', surgeMultiplier: 1,
        notes: 'Free delivery on orders above ₹199',
    };
}
