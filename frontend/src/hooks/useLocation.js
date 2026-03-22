import { useState, useCallback, useEffect } from 'react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

export function useLocation() {
    const [location, setLocationState] = useState(() => {
        try {
            const saved = localStorage.getItem('qcomm_location');
            return saved ? JSON.parse(saved) : null;
        } catch { return null; }
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const setLocation = useCallback(async ({ address, lat, lng, pincode }) => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${API_URL}/api/set-location`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, lat, lng, pincode }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to set location');
            }

            const loc = data.location;
            setLocationState(loc);
            localStorage.setItem('qcomm_location', JSON.stringify(loc));
            return loc;
        } catch (err) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    // Re-sync location with backend if we have a stored one
    useEffect(() => {
        if (location && !loading) {
            fetch(`${API_URL}/api/set-location`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(location),
            }).catch(() => { }); // silent re-sync
        }
    }, []); // eslint-disable-line

    return { location, setLocation, loading, error };
}
