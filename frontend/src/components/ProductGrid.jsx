import { useState, useMemo } from 'react';

const PLATFORM_COLORS = {
    blinkit: '#F7C948', zepto: '#8B5CF6', instamart: '#FC8019', bigbasket: '#84C225',
    flipkart_minutes: '#2874F0', jiomart: '#1A73E8', amazon_now: '#FF9900',
};
const PLATFORM_LABELS = {
    blinkit: 'Blinkit', zepto: 'Zepto', instamart: 'Instamart', bigbasket: 'BigBasket',
    flipkart_minutes: 'FK Minutes', jiomart: 'JioMart', amazon_now: 'Amazon Now',
};

const SORT_OPTIONS = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'price-asc', label: 'Price: Low → High' },
    { value: 'price-desc', label: 'Price: High → Low' },
    { value: 'platforms', label: 'Most Platforms' },
    { value: 'savings', label: 'Most Savings' },
];

const PRICE_RANGES = [
    { label: 'All', min: 0, max: Infinity },
    { label: 'Under ₹50', min: 0, max: 50 },
    { label: '₹50–200', min: 50, max: 200 },
    { label: '₹200+', min: 200, max: Infinity },
];

export default function ProductGrid({ results, searching, totalProducts, onAddToCart, searchQuery }) {
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('qcomm-view') || 'list');
    const [sortBy, setSortBy] = useState('relevance');
    const [priceRange, setPriceRange] = useState(0);
    const [hiddenPlatforms, setHiddenPlatforms] = useState(new Set());

    const togglePlatform = (pid) => {
        setHiddenPlatforms(prev => {
            const next = new Set(prev);
            next.has(pid) ? next.delete(pid) : next.add(pid);
            return next;
        });
    };

    const setView = (mode) => {
        setViewMode(mode);
        localStorage.setItem('qcomm-view', mode);
    };

    // ─── Collect & clean products (always runs) ───
    const allProducts = [];
    const activePlatforms = new Set();
    for (const [platformId, data] of Object.entries(results)) {
        if (!data?.products) continue;
        activePlatforms.add(platformId);
        for (const product of data.products) {
            if (!product.name || product.name.trim().length < 5) continue;
            if (!product.price || product.price < 5) continue;

            let cleanedName = product.name
                .replace(/\d[\d.]*\s*Ratings?\b/gi, '')
                .replace(/\d[\d.]*\s*Reviews?\b/gi, '')
                .replace(/\(\d[\d,.]*\s*(Ratings?|Reviews?)\)/gi, '')
                .replace(/\d+%\s*off\b/gi, '')
                .replace(/\bsponsored\b/gi, '')
                .replace(/\bADD\b/g, '')
                .replace(/\s+\d{4,}\s*$/g, '')
                .replace(/\s+-\s*$/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim();

            if (cleanedName.length < 5) continue;
            allProducts.push({ ...product, name: cleanedName });
        }
    }

    // ─── Build comparison groups (always runs) ───
    const baseGroups = allProducts.length > 0 ? buildComparisonGroups(allProducts, searchQuery) : [];

    // ─── Apply filters & sorting (always runs) ───
    const { min: pMin, max: pMax } = PRICE_RANGES[priceRange];

    const filteredGroups = baseGroups
        .map(group => {
            if (hiddenPlatforms.size === 0) return group;
            const filtered = group.items.filter(i => !hiddenPlatforms.has(i.platform));
            if (filtered.length === 0) return null;
            return { ...group, items: filtered };
        })
        .filter(Boolean)
        .filter(group => {
            const cheapest = Math.min(...group.items.map(i => i.price));
            return cheapest >= pMin && cheapest < pMax;
        });

    const sortedGroups = [...filteredGroups];
    if (sortBy === 'price-asc') {
        sortedGroups.sort((a, b) => Math.min(...a.items.map(i => i.price)) - Math.min(...b.items.map(i => i.price)));
    } else if (sortBy === 'price-desc') {
        sortedGroups.sort((a, b) => Math.min(...b.items.map(i => i.price)) - Math.min(...a.items.map(i => i.price)));
    } else if (sortBy === 'platforms') {
        sortedGroups.sort((a, b) => b.items.length - a.items.length);
    } else if (sortBy === 'savings') {
        const getSavings = (g) => g.items.length > 1 ? Math.max(...g.items.map(i => i.price)) - Math.min(...g.items.map(i => i.price)) : 0;
        sortedGroups.sort((a, b) => getSavings(b) - getSavings(a));
    }

    // ─── Stats (always called — no early returns before this) ───
    const stats = useMemo(() => {
        if (baseGroups.length === 0) return { avgPrice: 0, maxSavings: 0, cheapestPlatform: '', totalProducts: 0 };

        const allPrices = baseGroups.flatMap(g => g.items.map(i => i.price));
        const avgPrice = allPrices.length > 0 ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length) : 0;
        const maxSavings = baseGroups.reduce((max, g) => {
            if (g.items.length < 2) return max;
            const s = Math.max(...g.items.map(i => i.price)) - Math.min(...g.items.map(i => i.price));
            return Math.max(max, s);
        }, 0);

        // Find cheapest platform overall
        const platformTotals = {};
        baseGroups.forEach(g => {
            g.items.forEach(item => {
                if (!platformTotals[item.platform]) platformTotals[item.platform] = { total: 0, count: 0 };
                platformTotals[item.platform].total += item.price;
                platformTotals[item.platform].count += 1;
            });
        });
        let cheapestPlatform = '';
        let cheapestAvg = Infinity;
        for (const [pid, data] of Object.entries(platformTotals)) {
            const avg = data.total / data.count;
            if (avg < cheapestAvg) { cheapestAvg = avg; cheapestPlatform = pid; }
        }

        return { avgPrice, maxSavings, cheapestPlatform, totalProducts: baseGroups.length };
    }, [baseGroups]);

    const numPlatforms = new Set(allProducts.map(p => p.platform)).size;

    // ─── Loading skeleton ───
    if (searching && Object.keys(results).length === 0) {
        return (
            <div className="results-section">
                <div className="comparison-list skeleton-row">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="skeleton skeleton-card" style={{ animationDelay: `${i * 120}ms` }} />
                    ))}
                </div>
            </div>
        );
    }

    // ─── No results ───
    if (allProducts.length === 0 && !searching) {
        if (Object.keys(results).length > 0) {
            return (
                <div className="results-section">
                    <div className="empty-state">
                        <div className="empty-state-icon">🔍</div>
                        <h3>No products found</h3>
                        <p>Try a different search term or check if your location is serviceable.</p>
                    </div>
                </div>
            );
        }
        return null;
    }

    return (
        <div className="results-section">
            {/* ─── Stats Banner ─── */}
            <div className="stats-banner">
                <div className="stat-item">
                    <div className="stat-value">{stats.totalProducts}</div>
                    <div className="stat-label">Products</div>
                </div>
                <div className="stat-divider" />
                <div className="stat-item">
                    <div className="stat-value">{numPlatforms}</div>
                    <div className="stat-label">Platforms</div>
                </div>
                <div className="stat-divider" />
                <div className="stat-item">
                    <div className="stat-value">₹{stats.avgPrice}</div>
                    <div className="stat-label">Avg Price</div>
                </div>
                <div className="stat-divider" />
                <div className="stat-item stat-highlight">
                    <div className="stat-value">₹{stats.maxSavings}</div>
                    <div className="stat-label">Max Savings</div>
                </div>
                {stats.cheapestPlatform && (
                    <>
                        <div className="stat-divider" />
                        <div className="stat-item">
                            <div className="stat-value" style={{ color: PLATFORM_COLORS[stats.cheapestPlatform] }}>
                                {PLATFORM_LABELS[stats.cheapestPlatform]}
                            </div>
                            <div className="stat-label">Cheapest Overall</div>
                        </div>
                    </>
                )}
                {searching && (
                    <div className="stat-item stat-searching">
                        <div className="stat-value">⏳</div>
                        <div className="stat-label">Still searching...</div>
                    </div>
                )}
            </div>

            {/* ─── Results Toolbar ─── */}
            <div className="results-toolbar">
                <div className="toolbar-left">
                    <div className="results-count">
                        <strong>{sortedGroups.length}</strong> of {stats.totalProducts} results
                    </div>
                </div>

                <div className="toolbar-right">
                    {/* Sort */}
                    <select
                        className="sort-select"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                    >
                        {SORT_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>

                    {/* View Toggle */}
                    <div className="view-toggle">
                        <button
                            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                            onClick={() => setView('list')}
                            title="List view"
                        >☰</button>
                        <button
                            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                            onClick={() => setView('grid')}
                            title="Grid view"
                        >⊞</button>
                    </div>
                </div>
            </div>

            {/* ─── Filter Row ─── */}
            <div className="filter-row">
                {/* Platform Chips */}
                <div className="filter-chips">
                    {Object.entries(PLATFORM_LABELS).map(([pid, label]) => {
                        if (!activePlatforms.has(pid)) return null;
                        const hidden = hiddenPlatforms.has(pid);
                        return (
                            <button
                                key={pid}
                                className={`filter-chip ${hidden ? 'hidden-chip' : ''}`}
                                onClick={() => togglePlatform(pid)}
                                style={{ '--chip-color': PLATFORM_COLORS[pid] }}
                            >
                                <span className="chip-dot" style={{ background: hidden ? 'var(--text-muted)' : PLATFORM_COLORS[pid] }} />
                                {label}
                            </button>
                        );
                    })}
                </div>

                {/* Price Range */}
                <div className="price-range-btns">
                    {PRICE_RANGES.map((range, i) => (
                        <button
                            key={i}
                            className={`range-btn ${priceRange === i ? 'active' : ''}`}
                            onClick={() => setPriceRange(i)}
                        >
                            {range.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ─── Product Results ─── */}
            {sortedGroups.length === 0 ? (
                <div className="empty-state" style={{ padding: '48px 0' }}>
                    <div className="empty-state-icon">🔎</div>
                    <h3>No results match your filters</h3>
                    <p>Try adjusting your price range or platform filters.</p>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid-view">
                    {sortedGroups.map((group, idx) => (
                        <GridCard key={idx} group={group} index={idx} onAddToCart={onAddToCart} />
                    ))}
                </div>
            ) : (
                <div className="comparison-list">
                    {sortedGroups.map((group, idx) => (
                        <ComparisonCard key={idx} group={group} index={idx} onAddToCart={onAddToCart} />
                    ))}
                </div>
            )}
        </div>
    );
}

/* ━━━━━━━━━━ Grid Card ━━━━━━━━━━ */
function GridCard({ group, index, onAddToCart }) {
    const [showDetail, setShowDetail] = useState(false);
    const sorted = [...group.items].sort((a, b) => a.price - b.price);
    const cheapest = sorted[0];
    const savings = sorted.length > 1 ? sorted[sorted.length - 1].price - cheapest.price : 0;

    return (
        <div className="grid-card" style={{ animationDelay: `${index * 40}ms` }}>
            <div className="grid-card-img-wrap">
                {group.bestImage ? (
                    <img src={group.bestImage} alt="" className="grid-card-img" loading="lazy"
                        onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                    <div className="grid-card-img-placeholder">📦</div>
                )}
                {savings > 0 && (
                    <span className="grid-savings-badge">Save ₹{savings}</span>
                )}
            </div>

            <div className="grid-card-body">
                <div className="grid-card-name">{group.displayName}</div>
                {group.quantity && <div className="grid-card-qty">{group.quantity}</div>}

                <div className="grid-card-price-row">
                    <span className="grid-card-price">₹{cheapest.price}</span>
                    {cheapest.mrp > cheapest.price && (
                        <span className="grid-card-mrp">₹{cheapest.mrp}</span>
                    )}
                </div>

                <div className="grid-card-meta">
                    <span className="grid-card-platform">
                        <span className="dot" style={{ background: PLATFORM_COLORS[cheapest.platform] }} />
                        {PLATFORM_LABELS[cheapest.platform]}
                    </span>
                    {sorted.length > 1 && (
                        <span className="grid-card-more">+{sorted.length - 1} more</span>
                    )}
                </div>

                <div className="grid-card-actions">
                    <button className="add-cart-btn" onClick={() => onAddToCart(cheapest)}>+ Add</button>
                    {sorted.length > 1 && (
                        <button className="grid-compare-btn" onClick={() => setShowDetail(!showDetail)}>
                            {showDetail ? 'Hide' : 'Compare'}
                        </button>
                    )}
                </div>
            </div>

            {/* Expandable comparison detail */}
            {showDetail && (
                <div className="grid-card-detail">
                    {sorted.map((item, i) => (
                        <div key={i} className={`grid-detail-row ${i === 0 ? 'is-cheapest' : ''}`}>
                            <span className="dot" style={{ background: PLATFORM_COLORS[item.platform] }} />
                            <span className="name">{PLATFORM_LABELS[item.platform]}</span>
                            <span className="price">₹{item.price}</span>
                            {item.deliveryEta && <span className="eta">{item.deliveryEta}</span>}
                            {i === 0 && <span className="cheapest-tag">Cheapest</span>}
                            <button className="add-cart-btn mini" onClick={() => onAddToCart(item)}>+</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ━━━━━━━━━━ List Comparison Card ━━━━━━━━━━ */
function ComparisonCard({ group, index, onAddToCart }) {
    const [expanded, setExpanded] = useState(false);

    const sorted = [...group.items].sort((a, b) => a.price - b.price);
    const cheapest = sorted[0];
    const others = sorted.slice(1);
    const mostExpensive = sorted[sorted.length - 1];
    const savings = sorted.length > 1 ? mostExpensive.price - cheapest.price : 0;

    return (
        <div className="comparison-card" style={{ animationDelay: `${index * 50}ms` }}>
            <div className="comparison-card-header">
                {group.bestImage ? (
                    <img src={group.bestImage} alt="" className="comparison-thumb" loading="lazy"
                        onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                    <div className="comparison-thumb-placeholder">📦</div>
                )}
                <div className="comparison-product-info">
                    <h3>{group.displayName}</h3>
                    {group.quantity && <div className="product-qty">{group.quantity}</div>}
                    <div className="platform-count">
                        Available on {group.items.length} platform{group.items.length > 1 ? 's' : ''}
                        {savings > 0 && (
                            <span className="savings-indicator">• Save ₹{savings}</span>
                        )}
                    </div>
                </div>
                <div className="comparison-best-price">
                    <div className="best-label">Best price</div>
                    <div className="best-price">₹{cheapest.price}</div>
                </div>
            </div>

            <div className="platform-prices">
                <PlatformRow item={cheapest} isCheapest={sorted.length > 1} onAddToCart={onAddToCart} />
            </div>

            {others.length > 0 && (
                <>
                    <div className={`platform-prices-collapsed ${expanded ? 'expanded' : ''}`}>
                        <div className="platform-prices">
                            {others.map((item, i) => (
                                <PlatformRow key={`${item.platform}-${i}`} item={item} isCheapest={false} onAddToCart={onAddToCart} />
                            ))}
                        </div>
                    </div>

                    <button
                        className={`compare-toggle ${expanded ? 'expanded' : ''}`}
                        onClick={() => setExpanded(!expanded)}
                    >
                        <span className="toggle-dots">
                            {others.slice(0, 4).map((item, i) => (
                                <span key={i} style={{ background: PLATFORM_COLORS[item.platform] || '#888' }} />
                            ))}
                        </span>
                        {expanded ? 'Hide' : 'Compare'} {others.length} more platform{others.length > 1 ? 's' : ''}
                        <span className="toggle-arrow">▼</span>
                    </button>
                </>
            )}
        </div>
    );
}

/* ━━━━━━━━━━ Platform Price Row ━━━━━━━━━━ */
function PlatformRow({ item, isCheapest, onAddToCart }) {
    const color = PLATFORM_COLORS[item.platform] || '#888';

    return (
        <div className={`platform-price-row ${isCheapest ? 'is-cheapest' : ''}`}>
            <div className="platform-badge">
                <span className="dot" style={{ background: color }} />
                <span className="name">{PLATFORM_LABELS[item.platform] || item.platform}</span>
            </div>

            <div className="platform-price-info">
                <div className="price-tag">
                    <span className="current">₹{item.price}</span>
                    {item.mrp > item.price && <span className="mrp">₹{item.mrp}</span>}
                    {item.discountPercent > 0 && <span className="discount">{item.discountPercent}%</span>}
                </div>
                {item.deliveryEta && <span className="delivery-eta">🕐 {item.deliveryEta}</span>}
                {isCheapest && <span className="cheapest-tag">Cheapest</span>}
            </div>

            <button className="add-cart-btn" onClick={() => onAddToCart(item)}>+ Add</button>
        </div>
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── Quantity-Aware Cross-Platform Product Matching ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractQuantity(name) {
    const qtyRegex = /(\d+\.?\d*)\s*(ml|ltr|litre|liter|l|kg|kgs|gm|gms|g|pcs|piece|pieces|pack|units?)\b/gi;
    const matches = [...name.matchAll(qtyRegex)];
    if (matches.length === 0) return null;
    const m = matches[matches.length - 1];
    const value = parseFloat(m[1]);
    const rawUnit = m[2].toLowerCase();

    let normalized, unit, display;
    if (['ml'].includes(rawUnit)) {
        normalized = value; unit = 'ml'; display = `${value} ml`;
    } else if (['l', 'ltr', 'litre', 'liter'].includes(rawUnit)) {
        normalized = value * 1000; unit = 'ml'; display = `${value} L`;
    } else if (['g', 'gm', 'gms'].includes(rawUnit)) {
        normalized = value; unit = 'g'; display = `${value} g`;
    } else if (['kg', 'kgs'].includes(rawUnit)) {
        normalized = value * 1000; unit = 'g'; display = `${value} kg`;
    } else if (['pcs', 'piece', 'pieces', 'pack', 'unit', 'units'].includes(rawUnit)) {
        normalized = value; unit = 'pcs'; display = `${value} pcs`;
    } else {
        normalized = value; unit = rawUnit; display = `${value} ${rawUnit}`;
    }

    return { value, unit, normalized, display };
}

function tokenize(name) {
    return name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([a-zA-Z])(\d)/g, '$1 $2')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w =>
            w.length > 1 &&
            !['the', 'and', 'for', 'add', 'buy', 'new', 'of', 'with',
                'pouch', 'packet', 'bottle', 'box', 'combo', 'set',
                'each', 'per', 'nos'].includes(w)
        );
}

function normalizeName(name) {
    return name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([a-zA-Z])(\d)/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanName(name) {
    return normalizeName(name);
}

/** Extract quantity text from name as a fallback display string */
function extractQtyText(name) {
    // Broad pattern: find "500ml", "1 L", "250 gm", "1kg", "Pack of 6", etc.
    const m = name.match(/\d+\.?\d*\s*(?:ml|ltr|litre|liter|l|kg|kgs|gm|gms|g|pcs|piece|pieces|pack|units?)\b/i);
    if (m) return m[0].trim();
    // "Pack of N"
    const pm = name.match(/pack\s+of\s+\d+/i);
    if (pm) return pm[0];
    return '';
}

function extractBrand(name) {
    const normalized = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    const words = normalized.split(/\s+/).filter(w => w.length > 1);
    return words.slice(0, 2).join(' ');
}

function buildComparisonGroups(products, searchQuery) {
    const groups = [];

    const normalized = products.map(p => {
        const qty = extractQuantity(p.name) || extractQuantity(p.quantity || '');
        return {
            ...p,
            normalizedName: normalizeName(p.name),
            tokens: tokenize(p.name),
            brand: extractBrand(p.name),
            parsedQty: qty,
        };
    });

    for (const product of normalized) {
        let bestMatch = null;
        let bestScore = 0;

        for (const group of groups) {
            if (group.items.find(i => i.platform === product.platform)) continue;
            if (!quantitiesMatch(product.parsedQty, group.parsedQty)) continue;

            const groupMinPrice = Math.min(...group.items.map(i => i.price));
            const priceRatio = product.price > groupMinPrice
                ? product.price / groupMinPrice
                : groupMinPrice / product.price;
            if (priceRatio > 3) continue;

            const score = matchScore(product, group);
            if (score > bestScore && score > 0.35) {
                bestScore = score;
                bestMatch = group;
            }
        }

        if (bestMatch) {
            bestMatch.items.push(product);
            if (!bestMatch.bestImage && product.image) bestMatch.bestImage = product.image;
            // Prefer the LONGEST name — short names are often truncated brand names
            const candidateName = cleanName(product.name);
            if (candidateName.length > bestMatch.displayName.length) {
                bestMatch.displayName = candidateName;
            }
            // Update quantity if better info available
            if (!bestMatch.quantity && (product.parsedQty?.display || product.quantity)) {
                bestMatch.quantity = product.parsedQty?.display || product.quantity || '';
            }
        } else {
            const qtyDisplay = product.parsedQty?.display || product.quantity || extractQtyText(product.name) || '';
            groups.push({
                tokens: product.tokens,
                brand: product.brand,
                normalizedName: product.normalizedName,
                displayName: cleanName(product.name),
                quantity: qtyDisplay,
                parsedQty: product.parsedQty,
                bestImage: product.image || '',
                items: [product],
            });
        }
    }

    const queryWords = (searchQuery || '').toLowerCase().split(/\s+/).filter(w => w.length > 1);

    groups.sort((a, b) => {
        const relevanceA = queryWords.length > 0
            ? queryWords.filter(w => a.displayName.toLowerCase().includes(w)).length / queryWords.length
            : 0;
        const relevanceB = queryWords.length > 0
            ? queryWords.filter(w => b.displayName.toLowerCase().includes(w)).length / queryWords.length
            : 0;
        if (relevanceA !== relevanceB) return relevanceB - relevanceA;
        if (b.items.length !== a.items.length) return b.items.length - a.items.length;
        return Math.min(...a.items.map(i => i.price)) - Math.min(...b.items.map(i => i.price));
    });

    return groups;
}

function quantitiesMatch(qA, qB) {
    if (!qA && !qB) return true;
    if (!qA || !qB) return false;
    if (qA.unit !== qB.unit) return false;
    const ratio = qA.normalized / qB.normalized;
    return ratio >= 0.9 && ratio <= 1.1;
}

function matchScore(product, group) {
    const tokA = product.tokens;
    const tokB = group.tokens;

    const setA = new Set(tokA);
    const setB = new Set(tokB);
    const intersection = [...setA].filter(x => setB.has(x));
    const union = new Set([...setA, ...setB]);
    const jaccard = union.size > 0 ? intersection.length / union.size : 0;

    let brandBonus = 0;
    if (product.brand && group.brand) {
        const brandA = product.brand.split(' ');
        const brandB = group.brand.split(' ');
        if (brandA[0] === brandB[0] && brandA[0].length > 2) {
            brandBonus = 0.25;
        }
    }

    let containment = 0;
    const shorter = tokA.length <= tokB.length ? tokA : tokB;
    const longer = tokA.length <= tokB.length ? tokB : tokA;
    const longerSet = new Set(longer);
    const shortMatches = shorter.filter(w => longerSet.has(w));
    if (shorter.length > 0) {
        containment = shortMatches.length / shorter.length;
    }

    return Math.max(jaccard + brandBonus, containment * 0.7 + brandBonus);
}
