/**
 * Swiggy Instamart Scraper — Playwright-based
 *
 * Uses Playwright (not Puppeteer) because Playwright's Chromium avoids
 * CloudFront's SignalAutomatedBrowser CDP detection that blocks Puppeteer.
 *
 * Flow:
 * 1. Launch Playwright Chromium (headless)
 * 2. Navigate to Instamart search page
 * 3. Type query with Playwright's fill() / type()
 * 4. Intercept Swiggy's search API response (returns HTTP 200 with product data)
 * 5. Parse structured JSON response
 */
import { chromium } from 'playwright';

export const platformInfo = {
    id: 'instamart',
    name: 'Swiggy Instamart',
    color: '#FC8019',
    deliveryTime: '15-20 mins',
    logo: 'https://www.swiggy.com/favicon.ico',
};

let locationContext = {};
let playwrightBrowser = null;

export async function setLocation(lat, lng, address, pincode) {
    locationContext = { lat, lng, address, pincode };
    return { success: true };
}

async function getPlaywrightBrowser() {
    if (!playwrightBrowser || !playwrightBrowser.isConnected()) {
        playwrightBrowser = await chromium.launch({
            headless: false,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--lang=en-US,en',
            ],
        });
        console.log('[instamart] Playwright browser launched');
    }
    return playwrightBrowser;
}

export async function search(query, location) {
    const loc = location || locationContext;
    let context, page;
    try {
        const browser = await getPlaywrightBrowser();

        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            viewport: { width: 1366, height: 768 },
            locale: 'en-US',
        });

        // Stealth
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            window.chrome = { runtime: {}, loadTimes: () => { }, csi: () => { } };
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: '' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
                    { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
                ],
            });
        });

        // Set location cookies
        if (loc.lat && loc.lng) {
            await context.addCookies([
                { name: 'lat', value: String(loc.lat), domain: '.swiggy.com', path: '/' },
                { name: 'lng', value: String(loc.lng), domain: '.swiggy.com', path: '/' },
                { name: 'userLat', value: String(loc.lat), domain: '.swiggy.com', path: '/' },
                { name: 'userLng', value: String(loc.lng), domain: '.swiggy.com', path: '/' },
            ]);
        }

        page = await context.newPage();

        // ─── API Interception ───────────────────────────────────────────────
        let capturedProducts = [];
        let resolved = false;

        const capturePromise = new Promise((resolve) => {
            const timeout = setTimeout(() => { if (!resolved) resolve([]); }, 25000);

            page.on('response', async (response) => {
                if (resolved) return;
                try {
                    const url = response.url();
                    if ((url.includes('/api/instamart/search') || url.includes('/suggest-items'))
                        && response.status() === 200) {
                        const text = await response.text().catch(() => '');
                        if (!text || text.length < 100) return;
                        try {
                            const json = JSON.parse(text);
                            const products = parseApiResponse(json);
                            if (products.length > 0) {
                                resolved = true;
                                clearTimeout(timeout);
                                console.log(`[instamart] ✓ intercepted ${products.length} products`);
                                resolve(products);
                            }
                        } catch { }
                    }
                } catch { }
            });
        });

        // ─── Navigate ───────────────────────────────────────────────────────
        console.log('[instamart] navigating...');
        await page.goto('https://www.swiggy.com/instamart/search?custom_back=true', {
            waitUntil: 'networkidle', timeout: 20000,
        }).catch(() => { });

        await page.waitForTimeout(1500);

        // ─── Type in search ─────────────────────────────────────────────────
        const input = page.locator('input._18fRo, input[type="search"]').first();

        if (await input.count() === 0) {
            // Try any visible input
            const fallbackInput = page.locator('input').first();
            if (await fallbackInput.count() === 0) {
                console.log('[instamart] no search input found');
                return formatProducts([]);
            }
        }

        console.log('[instamart] typing...');
        await input.click();
        await page.waitForTimeout(300);
        await input.type(query, { delay: 120 });

        // Wait for API response
        console.log('[instamart] waiting for results...');
        await page.waitForTimeout(4000);

        // ─── Check API interception ─────────────────────────────────────────
        capturedProducts = await Promise.race([
            capturePromise,
            new Promise(resolve => setTimeout(() => resolve([]), 5000))
        ]);

        if (capturedProducts.length > 0) {
            return formatProducts(capturedProducts);
        }

        // ─── Try clicking suggestion / pressing Enter ───────────────────────
        const suggestion = page.locator('div, span, a').filter({
            hasText: new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        }).first();

        if (await suggestion.count() > 0) {
            const box = await suggestion.boundingBox();
            if (box && box.y > 60 && box.y < 600) {
                console.log('[instamart] clicking suggestion...');
                await suggestion.click();
                await page.waitForTimeout(5000);
            }
        } else {
            console.log('[instamart] pressing Enter...');
            await input.press('Enter');
            await page.waitForTimeout(5000);
        }

        // Scroll for lazy loading
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => window.scrollBy(0, 400));
            await page.waitForTimeout(600);
        }

        // Check API again
        capturedProducts = await Promise.race([
            capturePromise,
            new Promise(resolve => setTimeout(() => resolve([]), 5000))
        ]);

        if (capturedProducts.length > 0) {
            return formatProducts(capturedProducts);
        }

        // ─── DOM/Body text fallback ─────────────────────────────────────────
        console.log('[instamart] trying body text...');
        const bodyText = await page.textContent('body').catch(() => '');
        const bodyProducts = parseBodyText(bodyText || '');
        console.log(`[instamart] body text: ${bodyProducts.length} products`);
        return formatProducts(bodyProducts);

    } catch (err) {
        console.error(`[instamart] error:`, err.message);
        return { products: [], error: err.message };
    } finally {
        if (context) await context.close().catch(() => { });
    }
}

function parseApiResponse(json) {
    const products = [];
    const IMG_PREFIX = 'https://instamart-media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,h_600/';
    try {
        // Swiggy format: data.cards[i].card.card.gridElements.infoWithStyle.items
        const cards = json?.data?.cards || json?.cards || [];
        for (const cardWrapper of cards) {
            const card = cardWrapper?.card?.card || cardWrapper;
            const items = card?.gridElements?.infoWithStyle?.items;
            if (!items || !Array.isArray(items)) continue;

            for (const item of items) {
                const name = item.displayName || item.name || '';
                if (!name || name.length < 3) continue;

                const variation = item.variations?.[0];
                if (!variation) continue;

                const offerUnits = parseInt(variation.price?.offerPrice?.units || '0');
                const mrpUnits = parseInt(variation.price?.mrp?.units || '0');
                const price = offerUnits || mrpUnits;
                if (price < 1 || price > 50000) continue;

                if (products.find(x => x.name === name)) continue;

                const imageId = variation.images?.[0] || item.imageId || '';
                const image = imageId ? (imageId.startsWith('http') ? imageId : IMG_PREFIX + imageId) : '';

                products.push({
                    name: name.substring(0, 120),
                    price,
                    mrp: mrpUnits > price ? mrpUnits : price,
                    image,
                    quantity: variation.quantityDescription || variation.quantity || '',
                });
            }
        }

        // If the top-level Swiggy format didn't work, try generic deep crawl
        if (products.length === 0) {
            const deepCollect = (obj, depth = 0) => {
                if (depth > 10 || !obj || typeof obj !== 'object') return;
                if (Array.isArray(obj)) { obj.forEach(x => deepCollect(x, depth + 1)); return; }
                const n = obj.displayName || obj.name || obj.productName || '';
                let p = parseInt(obj.price?.offerPrice?.units || obj.price?.units || '0') || obj.price || 0;
                if (typeof p !== 'number') p = 0;
                if (n && n.length >= 3 && p >= 1 && p <= 50000 && !products.find(x => x.name === n)) {
                    const m = parseInt(obj.price?.mrp?.units || '0') || obj.mrp || p;
                    products.push({ name: n.substring(0, 120), price: p, mrp: m > p ? m : p, image: '', quantity: '' });
                }
                for (const k of Object.keys(obj)) {
                    if (obj[k] && typeof obj[k] === 'object') deepCollect(obj[k], depth + 1);
                }
            };
            deepCollect(json);
        }
    } catch { }
    return products;
}

function parseBodyText(bodyText) {
    const items = [];
    if (!bodyText || bodyText.includes('Something went wrong')) return items;
    const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith('₹')) continue;
        const pm = lines[i].match(/₹(\d+)/);
        if (!pm) continue;
        const price = parseInt(pm[1]);
        if (price < 5 || price > 50000) continue;
        let name = '', quantity = '';
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
            const prev = lines[j];
            if (['ADD', 'Sponsored', 'OFF'].includes(prev)) continue;
            if (prev.startsWith('₹')) continue;
            if (prev.match(/^\d+\s*(ml|ltr|gm|kg|g|l|pcs|pack|pouch)/i)) { quantity = prev; continue; }
            if (prev.match(/^[\d.]+$/) || prev.match(/^\(\d/)) continue;
            if (prev.length >= 5 && prev.length <= 80 && prev.match(/[a-zA-Z]{2,}/)) { name = prev; break; }
        }
        if (!name || name.length < 5 || items.find(it => it.name === name)) continue;
        let mrp = price;
        if (i + 1 < lines.length && lines[i + 1].startsWith('₹')) {
            const m = lines[i + 1].match(/₹(\d+)/);
            if (m) { const v = parseInt(m[1]); if (v > price) mrp = v; }
        }
        items.push({ name, price, mrp: mrp > price ? mrp : price, quantity });
    }
    return items;
}

function formatProducts(products) {
    return {
        products: products.slice(0, 40).map((p, i) => ({
            id: `instamart-${i}`, platform: 'instamart',
            name: p.name, price: p.price, mrp: p.mrp,
            image: p.image || '', quantity: p.quantity || '',
            available: true, deliveryEta: '15-20 min',
            discountPercent: p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0,
            url: '',
        })),
    };
}

export function getDeliveryInfo() {
    return {
        deliveryFee: 29, freeDeliveryMinimum: 199, handlingCharge: 2,
        platformFee: 3, smallCartFee: 30, smallCartThreshold: 99,
        estimatedDelivery: '15-20 minutes', surgeMultiplier: 1,
        notes: 'Free delivery on orders above ₹199',
    };
}
