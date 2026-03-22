/**
 * QComm Backend Server
 * Express + WebSocket server that orchestrates searches across all quick commerce platforms.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import fetch from 'node-fetch';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
import { geocodeAddress, reverseGeocode } from './utils/geocoding.js';

// Import all platform modules
import * as blinkit from './platforms/blinkit.js';
import * as zepto from './platforms/zepto.js';
import * as instamart from './platforms/instamart.js';
import * as bigbasket from './platforms/bigbasket.js';
import * as flipkartMinutes from './platforms/flipkart_minutes.js';
import * as jiomart from './platforms/jiomart.js';
// DMart removed - next day delivery, not quick commerce
import * as amazonNow from './platforms/amazon_now.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || '';

// Middleware
const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...(FRONTEND_URL ? [FRONTEND_URL] : []),
];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Health check endpoint for deployment platforms
app.get('/health', (req, res) => res.json({ status: 'ok', platforms: Object.keys(platforms).length }));

// All platforms registry
const platforms = {
    blinkit,
    zepto,
    instamart,
    bigbasket,
    flipkart_minutes: flipkartMinutes,
    jiomart,

    amazon_now: amazonNow,
};

// Current location context (shared)
let currentLocation = null;

// ─── REST Endpoints ────────────────────────────────────────────────────────

/**
 * GET /api/platforms
 * Returns info about all supported platforms
 */
app.get('/api/platforms', (req, res) => {
    const infos = Object.entries(platforms).map(([key, mod]) => ({
        ...mod.platformInfo,
        deliveryInfo: mod.getDeliveryInfo(currentLocation),
    }));
    res.json({ platforms: infos });
});

/**
 * POST /api/set-location
 * Sets location context across all platforms
 * Body: { address?, lat?, lng?, pincode? }
 */
app.post('/api/set-location', async (req, res) => {
    try {
        let { address, lat, lng, pincode } = req.body;

        // If address provided but no coordinates, geocode it
        if (address && (!lat || !lng)) {
            const geo = await geocodeAddress(address);
            if (!geo) {
                return res.status(400).json({ error: 'Could not geocode address. Please try a more specific address or enter a pincode.' });
            }
            lat = geo.lat;
            lng = geo.lng;
            pincode = pincode || geo.pincode;
            address = geo.displayName;
        }

        // If coordinates provided but no address, reverse geocode
        if (lat && lng && !address) {
            const geo = await reverseGeocode(lat, lng);
            if (geo) {
                address = geo.displayName;
                pincode = pincode || geo.pincode;
            }
        }

        if (!lat || !lng) {
            return res.status(400).json({ error: 'Please provide either an address or lat/lng coordinates.' });
        }

        currentLocation = { lat, lng, address, pincode };

        // Set location on all platforms concurrently
        const locationResults = {};
        const settingPromises = Object.entries(platforms).map(async ([key, mod]) => {
            try {
                const result = await mod.setLocation(lat, lng, address, pincode);
                locationResults[key] = { success: true, ...result };
            } catch (err) {
                locationResults[key] = { success: false, error: err.message };
            }
        });

        await Promise.allSettled(settingPromises);

        res.json({
            success: true,
            location: currentLocation,
            platformResults: locationResults,
        });
    } catch (err) {
        console.error('Set location error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/search
 * Searches all platforms and returns aggregated results
 * Body: { query }
 */

// ─── Product Name Cleaning (used by both REST and WebSocket search) ─────────
function cleanProductName(name) {
    if (!name) return '';
    return name
        .replace(/\d[\d.]*\s*Ratings?/gi, '')         // "4.39106 Ratings", "4547Ratings", "Ratings1"
        .replace(/\d[\d.]*\s*Reviews?/gi, '')         // "123 Reviews", "123Reviews"
        .replace(/\(\d[\d,.]*\s*(Ratings?|Reviews?)\)/gi, '') // "(414461 Ratings)"
        .replace(/\d+%\s*off/gi, '')                  // "10% off"
        .replace(/\bsponsored\b/gi, '')               // "Sponsored"
        .replace(/\bADD\b/g, '')                      // "ADD" button text
        .replace(/\s+\d{4,}\s*$/g, '')                // trailing "41450"
        .replace(/\s+-\s*$/g, '')                     // trailing " - "
        .replace(/\s{2,}/g, ' ')
        .trim();
}

app.post('/api/search', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        if (!currentLocation) {
            return res.status(400).json({ error: 'Location not set. Please set your location first.' });
        }

        // Search all platforms concurrently
        const allResults = {};
        const searchPromises = Object.entries(platforms).map(async ([key, mod]) => {
            try {
                const startTime = Date.now();
                const result = await mod.search(query, currentLocation);
                const duration = Date.now() - startTime;

                // Clean product names from all platforms
                const cleanedProducts = (result.products || []).map(p => ({
                    ...p,
                    name: cleanProductName(p.name),
                })).filter(p => p.name && p.name.length >= 5 && p.price >= 5);

                allResults[key] = {
                    platform: mod.platformInfo,
                    products: cleanedProducts,
                    error: result.error || null,
                    count: cleanedProducts.length,
                    responseTime: duration,
                };
            } catch (err) {
                allResults[key] = {
                    platform: mod.platformInfo,
                    products: [],
                    error: err.message,
                    count: 0,
                    responseTime: 0,
                };
            }
        });

        await Promise.allSettled(searchPromises);

        const totalProducts = Object.values(allResults).reduce((sum, r) => sum + r.count, 0);

        res.json({
            query,
            location: currentLocation,
            totalProducts,
            results: allResults,
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/delivery-info
 * Returns delivery fee info for all platforms at current location
 */
app.get('/api/delivery-info', (req, res) => {
    if (!currentLocation) {
        return res.status(400).json({ error: 'Location not set' });
    }

    const info = {};
    for (const [key, mod] of Object.entries(platforms)) {
        info[key] = {
            platform: mod.platformInfo,
            ...mod.getDeliveryInfo(currentLocation),
        };
    }

    res.json({ location: currentLocation, deliveryInfo: info });
});

/**
 * GET /api/location
 * Returns the current location context
 */
app.get('/api/location', (req, res) => {
    res.json({ location: currentLocation });
});

/**
 * GET /api/autocomplete
 * Returns address suggestions as user types (like real apps)
 */
app.get('/api/autocomplete', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json({ suggestions: [] });

        // ── Strategy: Google Places (if key set) → Photon → Nominatim ──

        // 1. Google Places via RapidAPI — best building-level accuracy
        if (RAPIDAPI_KEY) {
            try {
                const RAPI_HOST = 'google-map-places.p.rapidapi.com';
                const rHeaders = {
                    'X-RapidAPI-Key': RAPIDAPI_KEY,
                    'X-RapidAPI-Host': RAPI_HOST,
                };

                const gParams = new URLSearchParams({
                    input: q,
                    components: 'country:in',
                    language: 'en',
                });
                if (currentLocation?.lat && currentLocation?.lng) {
                    gParams.set('location', `${currentLocation.lat},${currentLocation.lng}`);
                    gParams.set('radius', '50000');
                }
                const gRes = await fetch(
                    `https://${RAPI_HOST}/maps/api/place/autocomplete/json?${gParams}`,
                    { headers: rHeaders, signal: AbortSignal.timeout(5000) }
                );
                const gData = await gRes.json();

                if (gData.status === 'OK' && gData.predictions?.length) {
                    const suggestions = await Promise.all(
                        gData.predictions.slice(0, 8).map(async (pred) => {
                            let lat = 0, lng = 0, pincode = '';
                            try {
                                const dRes = await fetch(
                                    `https://${RAPI_HOST}/maps/api/place/details/json?` +
                                    new URLSearchParams({
                                        place_id: pred.place_id,
                                        fields: 'geometry,address_component',
                                    }),
                                    { headers: rHeaders, signal: AbortSignal.timeout(3000) }
                                );
                                const dData = await dRes.json();
                                if (dData.result?.geometry?.location) {
                                    lat = dData.result.geometry.location.lat;
                                    lng = dData.result.geometry.location.lng;
                                }
                                const comps = dData.result?.address_components || [];
                                const pcComp = comps.find(c => c.types?.includes('postal_code'));
                                if (pcComp) pincode = pcComp.long_name;
                            } catch { /* details failed, still return suggestion */ }

                            const mainText = pred.structured_formatting?.main_text || '';
                            const secondaryText = pred.structured_formatting?.secondary_text || '';
                            return {
                                displayName: pred.description,
                                lat, lng, pincode,
                                area: mainText,
                                city: secondaryText.split(',')[0]?.trim() || '',
                                state: secondaryText.split(',').slice(-2, -1)[0]?.trim() || '',
                            };
                        })
                    );
                    return res.json({ suggestions });
                }
            } catch (e) {
                console.log('[autocomplete] RapidAPI error, falling back:', e.message);
            }
        }

        // 2. Photon fallback — good building/POI data, free, no key needed
        let suggestions = [];
        try {
            const photonParams = new URLSearchParams({ q, limit: '8', lang: 'en' });
            if (currentLocation?.lat && currentLocation?.lng) {
                photonParams.set('lat', currentLocation.lat);
                photonParams.set('lon', currentLocation.lng);
            }
            const photonRes = await fetch(
                `https://photon.komoot.io/api?${photonParams}`,
                { headers: { 'Accept-Language': 'en' }, signal: AbortSignal.timeout(4000) }
            );
            const photonData = await photonRes.json();
            if (photonData?.features?.length) {
                suggestions = photonData.features
                    .filter(f => !f.properties?.countrycode || f.properties.countrycode.toUpperCase() === 'IN')
                    .map(f => {
                        const p = f.properties || {};
                        const parts = [p.name, p.street, p.district, p.city, p.state].filter(Boolean);
                        return {
                            displayName: parts.join(', ') + (p.postcode ? `, ${p.postcode}` : '') + ', India',
                            lat: f.geometry?.coordinates?.[1] || 0,
                            lng: f.geometry?.coordinates?.[0] || 0,
                            pincode: p.postcode || '',
                            area: [p.name, p.district].filter(Boolean).join(', '),
                            city: p.city || p.county || '',
                            state: p.state || '',
                        };
                    });
            }
        } catch { /* Photon failed */ }

        // 3. Nominatim fallback if still < 2
        if (suggestions.length < 2) {
            try {
                const nomRes = await fetch(
                    `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
                        q: q + ', India', format: 'json', addressdetails: '1', limit: '8', countrycodes: 'IN',
                    }),
                    { headers: { 'User-Agent': 'QComm/1.0', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(4000) }
                );
                const nomData = await nomRes.json();
                const existing = new Set(suggestions.map(s => `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`));
                const extras = (nomData || []).map(item => ({
                    displayName: item.display_name,
                    lat: parseFloat(item.lat), lng: parseFloat(item.lon),
                    pincode: item.address?.postcode || '',
                    area: [item.address?.suburb, item.address?.neighbourhood].filter(Boolean).join(', '),
                    city: item.address?.city || item.address?.town || '',
                    state: item.address?.state || '',
                })).filter(s => !existing.has(`${s.lat.toFixed(3)},${s.lng.toFixed(3)}`));
                suggestions = [...suggestions, ...extras];
            } catch { /* All failed */ }
        }

        res.json({ suggestions: suggestions.slice(0, 10) });
    } catch (err) {
        res.json({ suggestions: [] });
    }
});

/**
 * POST /api/geocode
 * Geocodes an address to lat/lng
 */
app.post('/api/geocode', async (req, res) => {
    try {
        const { address } = req.body;
        if (!address) return res.status(400).json({ error: 'Address is required' });

        const result = await geocodeAddress(address);
        if (!result) return res.status(404).json({ error: 'Could not find this address' });

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/calculate-cart
 * Calculates cart totals with all fees for each platform
 * Body: { items: [{ platform, productId, name, price, quantity }] }
 */
app.post('/api/calculate-cart', (req, res) => {
    try {
        const { items } = req.body;
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'Items array is required' });
        }

        // Group items by platform
        const platformGroups = {};
        for (const item of items) {
            if (!platformGroups[item.platform]) {
                platformGroups[item.platform] = [];
            }
            platformGroups[item.platform].push(item);
        }

        // Calculate totals for each platform
        const cartTotals = {};
        for (const [platformKey, platformItems] of Object.entries(platformGroups)) {
            const mod = platforms[platformKey];
            if (!mod) continue;

            const deliveryInfo = mod.getDeliveryInfo(currentLocation);
            const subtotal = platformItems.reduce((sum, item) => {
                return sum + (parseFloat(item.price) * (parseInt(item.qty) || 1));
            }, 0);

            const itemSavings = platformItems.reduce((sum, item) => {
                const mrp = parseFloat(item.mrp) || parseFloat(item.price);
                const price = parseFloat(item.price);
                return sum + ((mrp - price) * (parseInt(item.qty) || 1));
            }, 0);

            const deliveryFee = subtotal >= deliveryInfo.freeDeliveryMinimum ? 0 : (deliveryInfo.deliveryFee || 0);
            const handlingCharge = deliveryInfo.handlingCharge || 0;
            const platformFee = deliveryInfo.platformFee || 0;
            const smallCartFee = subtotal < (deliveryInfo.smallCartThreshold || 0) ? (deliveryInfo.smallCartFee || 0) : 0;

            const grandTotal = subtotal + deliveryFee + handlingCharge + platformFee + smallCartFee;

            cartTotals[platformKey] = {
                platform: mod.platformInfo,
                items: platformItems,
                itemCount: platformItems.length,
                subtotal: Math.round(subtotal * 100) / 100,
                deliveryFee,
                handlingCharge,
                platformFee,
                smallCartFee,
                grandTotal: Math.round(grandTotal * 100) / 100,
                itemSavings: Math.round(itemSavings * 100) / 100,
                freeDeliveryMinimum: deliveryInfo.freeDeliveryMinimum,
                amountForFreeDelivery: Math.max(0, deliveryInfo.freeDeliveryMinimum - subtotal),
                estimatedDelivery: deliveryInfo.estimatedDelivery,
                notes: deliveryInfo.notes,
            };
        }

        // Determine cheapest platform
        const totals = Object.values(cartTotals);
        const cheapest = totals.length > 0
            ? totals.reduce((min, t) => t.grandTotal < min.grandTotal ? t : min)
            : null;

        res.json({
            cartTotals,
            cheapestPlatform: cheapest?.platform?.id || null,
            maxSavings: cheapest
                ? Math.round((Math.max(...totals.map(t => t.grandTotal)) - cheapest.grandTotal) * 100) / 100
                : 0,
        });
    } catch (err) {
        console.error('Calculate cart error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── WebSocket for Real-time Search ────────────────────────────────────────

wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());

            if (data.type === 'search') {
                const { query } = data;

                if (!currentLocation) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Location not set' }));
                    return;
                }

                ws.send(JSON.stringify({ type: 'search_start', query, platformCount: Object.keys(platforms).length }));

                // Fan out searches to all platforms in parallel, streaming results as they arrive
                const searchPromises = Object.entries(platforms).map(async ([key, mod]) => {
                    try {
                        ws.send(JSON.stringify({
                            type: 'platform_loading',
                            platform: mod.platformInfo,
                        }));

                        const startTime = Date.now();
                        const result = await mod.search(query, currentLocation);
                        const duration = Date.now() - startTime;

                        // Clean product names and filter
                        const cleanedProducts = (result.products || []).map(p => ({
                            ...p,
                            name: cleanProductName(p.name),
                        })).filter(p => {
                            if (!p.name || p.name.length < 5 || p.price < 5) return false;
                            // Filter extreme discounts (likely scraping artifacts)
                            if (p.mrp && p.mrp > p.price && p.price < p.mrp * 0.15) return false;
                            return true;
                        });

                        ws.send(JSON.stringify({
                            type: 'platform_results',
                            platform: mod.platformInfo,
                            products: cleanedProducts,
                            error: result.error || null,
                            count: cleanedProducts.length,
                            responseTime: duration,
                        }));
                    } catch (err) {
                        ws.send(JSON.stringify({
                            type: 'platform_error',
                            platform: mod.platformInfo,
                            error: err.message,
                        }));
                    }
                });

                await Promise.allSettled(searchPromises);

                ws.send(JSON.stringify({ type: 'search_complete', query }));
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'error', message: err.message }));
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});

// ─── Start Server ──────────────────────────────────────────────────────────

server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║             QComm Backend Server                     ║
║                                                      ║
║  REST API:    http://localhost:${PORT}                  ║
║  WebSocket:   ws://localhost:${PORT}                    ║
║                                                      ║
║  Platforms:   ${Object.keys(platforms).length} active                            ║
║  ${Object.values(platforms).map(m => `• ${m.platformInfo.name}`).join('\n║  ')}
║                                                      ║
╚══════════════════════════════════════════════════════╝
  `);
});

export default app;
