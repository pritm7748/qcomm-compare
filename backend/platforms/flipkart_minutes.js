/**
 * Flipkart Minutes Scraper — Full Resource Mode
 *
 * Key findings:
 * - Works in headless:'new' but ONLY without resource blocking
 * - Location flow: type area → click suggestion (element 30-120px height) → Confirm → store loads
 * - Suggestion click must target leaf elements, not container DIVs
 * - Search: navigate to /search?q=...&marketplace=HYPERLOCAL after location set
 */
import { newFullPage } from '../utils/browser.js';

export const platformInfo = {
    id: 'flipkart_minutes',
    name: 'Flipkart Minutes',
    color: '#2874F0',
    deliveryTime: '8-14 mins',
    logo: 'https://www.flipkart.com/favicon.ico',
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
        page = await newFullPage();
        const address = loc.address || 'Koramangala';
        const searchTerm = address.split(',')[0].trim();

        // Navigate to FK Minutes store
        await page.goto('https://www.flipkart.com/flipkart-minutes-store?marketplace=HYPERLOCAL', {
            waitUntil: 'networkidle2', timeout: 25000,
        }).catch(() => { });
        await new Promise(r => setTimeout(r, 5000));

        // Close popup (Escape is most reliable)
        await page.keyboard.press('Escape');
        await new Promise(r => setTimeout(r, 1000));

        // Check if location needs to be set
        const areaRect = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input');
            for (const inp of inputs) {
                const ph = (inp.placeholder || '').toLowerCase();
                if (ph.includes('area') || ph.includes('street') || ph.includes('pin')) {
                    const r = inp.getBoundingClientRect();
                    if (r.width > 100) return { x: r.x + r.width / 2, y: r.y + r.height / 2, found: true };
                }
            }
            return { found: false };
        });

        if (areaRect.found) {
            // Type location
            await page.mouse.click(areaRect.x, areaRect.y);
            await new Promise(r => setTimeout(r, 300));
            await page.keyboard.type(searchTerm, { delay: 50 });
            await new Promise(r => setTimeout(r, 3000));

            // Click suggestion — find correctly-sized elements (30-120px height, leaf nodes)
            // NOT the big container div (300px+), but individual suggestion items
            const clickTarget = await page.evaluate((term) => {
                const termLower = term.toLowerCase();
                const allEls = document.querySelectorAll('*');
                for (const el of allEls) {
                    if (el.children.length > 3) continue; // Skip containers
                    const text = (el.textContent || '').trim();
                    if (!text.toLowerCase().includes(termLower)) continue;
                    if (!text.match(/india|karnataka|maharashtra|delhi|bengaluru|mumbai/i)) continue;

                    const r = el.getBoundingClientRect();
                    // Individual suggestion items: 30-120px height, visible, below header
                    if (r.height >= 30 && r.height <= 120 && r.width > 100 && r.y > 100 && el.offsetParent !== null) {
                        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: text.substring(0, 60) };
                    }
                }
                return null;
            }, searchTerm);

            if (clickTarget) {
                await page.mouse.click(clickTarget.x, clickTarget.y);
                console.log(`[flipkart_minutes] Clicked suggestion: ${clickTarget.text}`);
            } else {
                // Fallback: try all elements with "India" text
                const fallback = await page.evaluate(() => {
                    const allEls = document.querySelectorAll('*');
                    for (const el of allEls) {
                        if (el.children.length > 2) continue;
                        const text = (el.textContent || '').trim();
                        if (text.includes('India') && text.length < 100) {
                            const r = el.getBoundingClientRect();
                            if (r.height >= 20 && r.height <= 120 && r.y > 100) {
                                return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
                            }
                        }
                    }
                    return null;
                });
                if (fallback) await page.mouse.click(fallback.x, fallback.y);
            }
            await new Promise(r => setTimeout(r, 4000));

            // Click Confirm button (may be a button or input[type=submit])
            const confirmClicked = await page.evaluate(() => {
                const btns = [...document.querySelectorAll('button, input[type="submit"], [role="button"]')];
                for (const b of btns) {
                    const text = (b.textContent || b.value || '').trim().toLowerCase();
                    if (text.includes('confirm')) {
                        const r = b.getBoundingClientRect();
                        if (r.width > 0) { b.click(); return true; }
                    }
                }
                return false;
            });

            if (!confirmClicked) {
                // Try mouse click at the Confirm button position
                const confirmPos = await page.evaluate(() => {
                    const btns = [...document.querySelectorAll('button, input[type="submit"]')];
                    for (const b of btns) {
                        const text = (b.textContent || b.value || '').trim().toLowerCase();
                        if (text.includes('confirm')) {
                            const r = b.getBoundingClientRect();
                            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
                        }
                    }
                    return null;
                });
                if (confirmPos) await page.mouse.click(confirmPos.x, confirmPos.y);
            }
            await new Promise(r => setTimeout(r, 5000));
        }

        // Navigate to search results 
        await page.goto(`https://www.flipkart.com/search?q=${encodeURIComponent(query)}&marketplace=HYPERLOCAL`, {
            waitUntil: 'networkidle2', timeout: 20000,
        }).catch(() => { });
        await new Promise(r => setTimeout(r, 5000));

        // Scroll multiple times for more products
        for (let i = 0; i < 4; i++) {
            await page.evaluate(() => window.scrollBy(0, 800)).catch(() => { });
            await new Promise(r => setTimeout(r, 1500));
        }

        // Strategy 1: DOM-based extraction — extract from product cards
        let products = await page.evaluate(() => {
            const items = [];
            const processed = new Set();

            // Find product links using multiple selectors
            const productLinks = document.querySelectorAll(
                'a[href*="/p/"], a[href*="/grocery/"], a[href*="/product/"], a[href*="/minutes/"]'
            );

            for (const link of productLinks) {
                try {
                    const href = link.href;
                    if (processed.has(href)) continue;
                    processed.add(href);

                    // Get the product card container (walk up to find the card)
                    let card = link.parentElement;
                    while (card && card !== document.body) {
                        // A card should contain both the link and a price
                        const cardText = card.textContent || '';
                        if (cardText.includes('₹') && card.querySelectorAll('img').length > 0) break;
                        card = card.parentElement;
                    }
                    if (!card || card === document.body) continue;

                    // Extract name from the link text
                    let name = (link.textContent || '').trim();
                    if (name.length < 3) continue;

                    // Extract all prices from this specific card
                    const cardText = card.textContent || '';
                    const priceMatches = [...cardText.matchAll(/₹\s*([\d,]+)/g)];
                    const prices = priceMatches
                        .map(m => parseInt(m[1].replace(/,/g, '')))
                        .filter(p => p > 0 && p < 50000);
                    if (prices.length === 0) continue;

                    const price = Math.min(...prices);
                    const mrp = prices.length > 1 ? Math.max(...prices) : price;

                    // Skip if price is too low (delivery fee or badge artifact)
                    if (price < 5) continue;

                    // Extract quantity from card text
                    let quantity = '';
                    const qtyMatch = cardText.match(/(\d+\.?\d*\s*(ml|ltr|l|gm|gms|g|kg|kgs|pcs|pack|piece|litre|liter))\b/i);
                    if (qtyMatch) quantity = qtyMatch[1];

                    // Get image
                    const img = card.querySelector('img');
                    const image = img?.src || '';

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
                    if (items.find(it => it.name === name)) continue;

                    items.push({
                        name: name.substring(0, 100),
                        price, mrp: mrp > price ? mrp : price,
                        quantity, image,
                    });
                } catch (e) { continue; }
            }
            return items;
        });

        // Strategy 2: Also run body text parsing and merge unique products
        {
            const bodyProducts = await page.evaluate(() => {
                const items = [];
                const bodyText = document.body?.innerText || '';
                if (bodyText.includes('Select city') || bodyText.includes('Verify Delivery') || bodyText.length < 100) return items;

                const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (!line.startsWith('₹')) continue;
                    const pm = line.match(/₹([\d,]+)/);
                    if (!pm) continue;
                    const price = parseInt(pm[1].replace(/,/g, ''));
                    if (price <= 0 || price > 50000 || price < 5) continue;

                    let name = '', quantity = '';
                    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
                        const prev = lines[j];
                        if (['ADD', 'Sponsored', 'OFF', 'Add'].includes(prev) || prev.match(/^\d+\s*MINS?$/i)) continue;
                        if (prev.startsWith('₹')) continue;
                        if (prev.match(/^\d+\s*(ml|ltr|gm|kg|g|l|pcs|pack)/i)) { quantity = prev; continue; }
                        if (prev.match(/^[\d.%]+$/) || prev.match(/^\(\d/)) continue;
                        if (prev.match(/^(Sponsored|Free|Delivery|Flipkart|Login|Cart|Explore|More|Grocery|Dairy)/i)) continue;
                        if (prev.length >= 5 && prev.length <= 80 && prev.match(/[a-zA-Z]{2,}/)) { name = prev; break; }
                    }
                    if (!name || name.length < 5 || items.find(it => it.name === name)) continue;

                    let mrp = price;
                    if (i + 1 < lines.length && lines[i + 1].startsWith('₹')) {
                        const m = lines[i + 1].match(/₹([\d,]+)/);
                        if (m) { const v = parseInt(m[1].replace(/,/g, '')); if (v > price) mrp = v; }
                    }
                    items.push({ name, price, mrp: mrp > price ? mrp : price, quantity });
                }
                return items;
            });

            // Merge
            const existingNames = new Set(products.map(p => p.name.toLowerCase()));
            for (const bp of bodyProducts) {
                if (!existingNames.has(bp.name.toLowerCase())) {
                    products.push(bp);
                    existingNames.add(bp.name.toLowerCase());
                }
            }
        }

        console.log(`[flipkart_minutes] DOM: ${products.length} products, names: ${products.map(p => p.name).join(' | ')}`);

        // Log body text products count
        const bodyCount = products.length; // before merge, for tracking
        console.log(`[flipkart_minutes] after merge: ${products.length} products (${bodyCount} from DOM + body merge)`);

        return {
            products: products.slice(0, 40).map((p, i) => ({
                id: `fkmin-${i}`, platform: 'flipkart_minutes',
                name: p.name, price: p.price, mrp: p.mrp,
                image: '', quantity: p.quantity || '',
                available: true, deliveryEta: '8-14 min',
                discountPercent: p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0,
                url: '',
            })),
        };
    } catch (err) {
        console.error(`[flipkart_minutes] search error:`, err.message);
        return { products: [], error: err.message };
    } finally {
        if (page) await page.close().catch(() => { });
    }
}

export function getDeliveryInfo() {
    return {
        deliveryFee: 29, freeDeliveryMinimum: 199, handlingCharge: 4,
        platformFee: 2, smallCartFee: 0, smallCartThreshold: 0,
        estimatedDelivery: '8-14 minutes', surgeMultiplier: 1,
        notes: 'Free delivery on orders above ₹199',
    };
}
