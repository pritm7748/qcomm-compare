/**
 * Geocoding utility using OpenStreetMap Nominatim
 */
import fetch from 'node-fetch';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

export async function geocodeAddress(address) {
    try {
        const res = await fetch(
            `${NOMINATIM_URL}/search?` + new URLSearchParams({
                q: address + ', India',
                format: 'json',
                addressdetails: '1',
                limit: '5',
                countrycodes: 'IN',
            }),
            {
                headers: {
                    'User-Agent': 'QComm-PriceComparison/1.0',
                    'Accept-Language': 'en',
                },
            }
        );

        const data = await res.json();
        if (!data || data.length === 0) return null;

        const best = data[0];
        return {
            lat: parseFloat(best.lat),
            lng: parseFloat(best.lon),
            displayName: best.display_name,
            address: best.address || {},
            pincode: best.address?.postcode || '',
        };
    } catch (err) {
        console.error('Geocoding error:', err.message);
        return null;
    }
}

export async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(
            `${NOMINATIM_URL}/reverse?` + new URLSearchParams({
                lat: lat.toString(),
                lon: lng.toString(),
                format: 'json',
                addressdetails: '1',
            }),
            {
                headers: {
                    'User-Agent': 'QComm-PriceComparison/1.0',
                    'Accept-Language': 'en',
                },
            }
        );

        const data = await res.json();
        return {
            lat,
            lng,
            displayName: data.display_name,
            address: data.address || {},
            pincode: data.address?.postcode || '',
        };
    } catch (err) {
        console.error('Reverse geocoding error:', err.message);
        return null;
    }
}
