import { useState, useRef, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function LocationPicker({ location, onSetLocation, loading }) {
    const [isOpen, setIsOpen] = useState(!location);
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [error, setError] = useState('');
    const debounceRef = useRef(null);
    const inputRef = useRef(null);

    // Fetch autocomplete suggestions as user types
    const fetchSuggestions = useCallback(async (q) => {
        if (q.length < 2) { setSuggestions([]); return; }
        setLoadingSuggestions(true);
        try {
            const res = await fetch(`${API_URL}/api/autocomplete?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            setSuggestions(data.suggestions || []);
        } catch { setSuggestions([]); }
        setLoadingSuggestions(false);
    }, []);

    const handleInput = (e) => {
        const val = e.target.value;
        setQuery(val);
        setError('');
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
    };

    const handleSelectSuggestion = async (suggestion) => {
        setError('');
        setSuggestions([]);
        setQuery(suggestion.displayName);
        try {
            await onSetLocation({
                address: suggestion.displayName,
                lat: suggestion.lat,
                lng: suggestion.lng,
                pincode: suggestion.pincode,
            });
            setIsOpen(false);
        } catch (err) {
            setError(err.message);
        }
    };

    // GPS Geolocation — reverse geocode with Nominatim
    const handleUseGPS = async () => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by this browser.');
            return;
        }
        setGpsLoading(true);
        setError('');
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true, timeout: 10000, maximumAge: 300000,
                });
            });
            const { latitude, longitude } = pos.coords;

            // Reverse geocode using Nominatim
            const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&zoom=18`,
                { headers: { 'Accept-Language': 'en' } }
            );
            const data = await res.json();
            const addr = data.address || {};
            const area = addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city_district || '';
            const city = addr.city || addr.town || addr.state_district || '';
            const state = addr.state || '';
            const pincode = addr.postcode || '';
            const displayParts = [area, city, state].filter(Boolean);
            const displayName = displayParts.join(', ') || data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

            setQuery(displayName);
            await onSetLocation({
                address: displayName,
                lat: latitude,
                lng: longitude,
                pincode,
            });
            setIsOpen(false);
        } catch (err) {
            if (err.code === 1) setError('Location access denied. Please allow location permissions.');
            else if (err.code === 2) setError('Location unavailable. Please try again or type manually.');
            else if (err.code === 3) setError('Location request timed out. Please try again.');
            else setError(err.message || 'Failed to get location.');
        }
        setGpsLoading(false);
    };

    useEffect(() => {
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, []);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const shortLocation = location?.address
        ? (() => {
            const parts = location.address.split(',').map(p => p.trim());
            if (parts.length >= 3) return parts.slice(0, 2).join(', ');
            return parts[0];
        })()
        : null;

    return (
        <>
            <div className="location-bar" onClick={() => setIsOpen(true)}>
                <span className="pin-icon">📍</span>
                <span className={`location-text ${location ? 'set' : ''}`}>
                    {shortLocation || 'Set your delivery location'}
                </span>
                {location?.pincode && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                        {location.pincode}
                    </span>
                )}
            </div>

            {isOpen && (
                <div className="location-modal-overlay" onClick={(e) => {
                    if (e.target === e.currentTarget && location) setIsOpen(false);
                }}>
                    <div className="location-modal">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <h2 style={{ margin: 0 }}>📍 Set Delivery Location</h2>
                            {location && (
                                <button
                                    onClick={() => setIsOpen(false)}
                                    style={{
                                        background: 'none', border: 'none', color: 'var(--text-muted)',
                                        fontSize: '20px', cursor: 'pointer', padding: '0 4px', lineHeight: 1,
                                    }}
                                >×</button>
                            )}
                        </div>

                        {/* GPS Button */}
                        <button
                            onClick={handleUseGPS}
                            disabled={gpsLoading}
                            style={{
                                width: '100%', padding: '12px 16px',
                                background: 'linear-gradient(135deg, var(--accent-glow), transparent)',
                                border: '1px solid var(--accent)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--accent)', fontWeight: 600, fontSize: '13px',
                                cursor: gpsLoading ? 'wait' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                marginTop: '12px', marginBottom: '12px',
                                transition: 'all 200ms ease',
                                opacity: gpsLoading ? 0.7 : 1,
                            }}
                            onMouseOver={(e) => { if (!gpsLoading) e.currentTarget.style.background = 'var(--accent-glow)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, var(--accent-glow), transparent)'; }}
                        >
                            {gpsLoading ? (
                                <><span style={{ animation: 'pulse 1s infinite' }}>📡</span> Detecting your location...</>
                            ) : (
                                <><span>🎯</span> Use my current location</>
                            )}
                        </button>

                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '12px',
                            margin: '4px 0 12px', color: 'var(--text-muted)', fontSize: '12px',
                        }}>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                            <span>or type your address</span>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                        </div>

                        <div style={{ position: 'relative' }}>
                            <input
                                ref={inputRef}
                                type="text"
                                className="location-input"
                                placeholder="Try: Koramangala, HSR Layout, Andheri West..."
                                value={query}
                                onChange={handleInput}
                                autoFocus
                                style={{ paddingRight: '36px' }}
                            />
                            {loadingSuggestions && (
                                <span style={{
                                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                                    fontSize: '14px', animation: 'pulse 1s infinite',
                                }}>⏳</span>
                            )}

                            {/* Autocomplete Dropdown */}
                            {suggestions.length > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%', left: 0, right: 0,
                                    background: 'var(--bg-tertiary)',
                                    border: '1px solid var(--border-medium)',
                                    borderTop: 'none',
                                    borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                                    maxHeight: '280px', overflowY: 'auto',
                                    zIndex: 10, boxShadow: 'var(--shadow-lg)',
                                }}>
                                    {suggestions.map((s, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => handleSelectSuggestion(s)}
                                            style={{
                                                padding: '10px 16px', cursor: 'pointer',
                                                borderBottom: '1px solid var(--border-subtle)',
                                                transition: 'background 150ms',
                                                display: 'flex', alignItems: 'flex-start', gap: '10px',
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-glass-strong)'}
                                            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <span style={{ fontSize: '16px', marginTop: '2px', flexShrink: 0 }}>📍</span>
                                            <div>
                                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                                                    {s.area || s.city || s.displayName.split(',')[0]}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                                                    {s.displayName.length > 80 ? s.displayName.substring(0, 80) + '...' : s.displayName}
                                                </div>
                                                {s.pincode && (
                                                    <span style={{
                                                        fontSize: '10px', color: 'var(--accent)', fontWeight: 600,
                                                        background: 'var(--accent-glow)', padding: '1px 6px',
                                                        borderRadius: 'var(--radius-sm)', marginTop: '4px', display: 'inline-block',
                                                    }}>
                                                        {s.pincode}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {error && (
                            <div style={{ color: 'var(--danger)', fontSize: '13px', marginTop: '8px' }}>
                                {error}
                            </div>
                        )}

                        {location && (
                            <div style={{
                                marginTop: '16px', padding: '12px',
                                background: 'var(--bg-glass)',
                                borderRadius: 'var(--radius-md)', fontSize: '12px',
                                color: 'var(--text-muted)',
                                border: '1px solid var(--border-subtle)',
                            }}>
                                <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    ✓ Current location
                                </div>
                                <div style={{ color: 'var(--text-primary)', fontSize: '13px' }}>
                                    {location.address}
                                </div>
                                {location.pincode && (
                                    <span style={{ color: 'var(--accent)', fontSize: '12px' }}> • {location.pincode}</span>
                                )}
                                <div style={{ marginTop: '8px' }}>
                                    <button
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => setIsOpen(false)}
                                    >
                                        Keep current location
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
