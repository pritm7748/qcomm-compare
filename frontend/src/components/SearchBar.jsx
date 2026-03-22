import { useState, useRef, useEffect } from 'react';

export default function SearchBar({ onSearch, searching, location, platformStates }) {
    const [value, setValue] = useState('');
    const inputRef = useRef(null);
    const debounceRef = useRef(null);

    const handleChange = (e) => {
        setValue(e.target.value);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (value.trim()) {
            onSearch(value.trim());
        }
    };

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    // Platform info with labels
    const platformLabels = {
        blinkit: 'Blinkit',
        zepto: 'Zepto',
        instamart: 'Instamart',
        bigbasket: 'BigBasket',
        flipkart_minutes: 'FK Minutes',
        jiomart: 'JioMart',

        amazon_now: 'Amazon Now',
    };

    return (
        <div className="search-section">
            <h1 className="search-title">Compare Quick Commerce Prices</h1>
            <p className="search-subtitle">
                Search across 7 platforms instantly. Find the best deals with real fees included.
            </p>

            <div className="search-container">
                <form onSubmit={handleSubmit}>
                    <div className="search-input-wrapper">
                        <span className="search-icon">🔍</span>
                        <input
                            ref={inputRef}
                            type="text"
                            className="search-input"
                            placeholder={location ? 'Search for groceries, snacks, milk...' : 'Set your location first to search'}
                            value={value}
                            onChange={handleChange}
                            disabled={!location}
                        />
                        <button
                            type="submit"
                            className="search-btn"
                            disabled={!location || !value.trim() || searching}
                        >
                            {searching ? 'Searching...' : 'Search'}
                        </button>
                    </div>
                </form>

                {/* Platform status pills */}
                {Object.keys(platformStates).length > 0 && (
                    <div className="platform-pills">
                        {Object.entries(platformLabels).map(([key, label]) => {
                            const state = platformStates[key] || 'idle';
                            return (
                                <span key={key} className={`platform-pill ${state}`}>
                                    <span className="dot" />
                                    {label}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
