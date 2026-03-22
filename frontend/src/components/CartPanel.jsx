const PLATFORM_LABELS = {
    blinkit: 'Blinkit',
    zepto: 'Zepto',
    instamart: 'Instamart',
    bigbasket: 'BigBasket',
    flipkart_minutes: 'FK Minutes',
    jiomart: 'JioMart',
    dmart: 'DMart',
    amazon_now: 'Amazon Now',
};

const PLATFORM_COLORS = {
    blinkit: '#F7C948',
    zepto: '#8B5CF6',
    instamart: '#FC8019',
    bigbasket: '#84C225',
    flipkart_minutes: '#2874F0',
    jiomart: '#0A3D80',
    dmart: '#E31E24',
    amazon_now: '#FF9900',
};

export default function CartPanel({
    items,
    itemCount,
    itemsByPlatform,
    isOpen,
    cartTotals,
    cheapestPlatform,
    calculating,
    onUpdateQty,
    onRemoveItem,
    onClearCart,
    onClose,
}) {
    if (!isOpen) return null;

    return (
        <>
            <div className="cart-overlay" onClick={onClose} />
            <div className="cart-panel">
                <div className="cart-header">
                    <h2>🛒 Your Cart ({itemCount})</h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {items.length > 0 && (
                            <button className="btn btn-sm btn-secondary" onClick={onClearCart}>
                                Clear All
                            </button>
                        )}
                        <button className="btn-icon" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div className="cart-body">
                    {items.length === 0 ? (
                        <div className="cart-empty">
                            <div className="cart-empty-icon">🛒</div>
                            <p>Your cart is empty</p>
                            <p style={{ fontSize: '12px' }}>
                                Search for products and add them to compare total costs across platforms.
                            </p>
                        </div>
                    ) : (
                        <>
                            {Object.entries(itemsByPlatform).map(([platform, platformItems]) => (
                                <div key={platform} style={{ marginBottom: 'var(--space-xl)' }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        marginBottom: 'var(--space-sm)',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        color: PLATFORM_COLORS[platform] || 'var(--text-secondary)',
                                    }}>
                                        <span style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            background: PLATFORM_COLORS[platform] || '#888',
                                        }} />
                                        {PLATFORM_LABELS[platform] || platform}
                                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                                            ({platformItems.length} items)
                                        </span>
                                    </div>

                                    {platformItems.map((item) => (
                                        <div key={`${item.id}-${item.platform}`} className="cart-item">
                                            {item.image && (
                                                <img src={item.image} alt="" className="cart-item-img" loading="lazy" />
                                            )}
                                            <div className="cart-item-info">
                                                <div className="cart-item-name">{item.name}</div>
                                                <div className="cart-item-meta">
                                                    {item.quantity && <span>{item.quantity}</span>}
                                                    {item.mrp > item.price && (
                                                        <span style={{ color: 'var(--success)' }}>
                                                            {item.discountPercent}% off
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="qty-control">
                                                <button
                                                    className="qty-btn"
                                                    onClick={() => onUpdateQty(item.id, item.platform, (item.qty || 1) - 1)}
                                                >
                                                    −
                                                </button>
                                                <span className="qty-value">{item.qty || 1}</span>
                                                <button
                                                    className="qty-btn"
                                                    onClick={() => onUpdateQty(item.id, item.platform, (item.qty || 1) + 1)}
                                                >
                                                    +
                                                </button>
                                            </div>

                                            <div className="cart-item-price">₹{(item.price * (item.qty || 1)).toFixed(0)}</div>

                                            <button
                                                className="cart-item-remove"
                                                onClick={() => onRemoveItem(item.id, item.platform)}
                                                title="Remove"
                                            >
                                                🗑
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </>
                    )}
                </div>

                {/* Cart Summary with Fee Breakdown */}
                {cartTotals && Object.keys(cartTotals).length > 0 && (
                    <div className="cart-summary">
                        <div className="cart-summary-title">
                            💰 Cost Comparison
                            {calculating && <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)' }}>updating...</span>}
                        </div>

                        <div className="platform-totals">
                            {Object.entries(cartTotals)
                                .sort(([, a], [, b]) => a.grandTotal - b.grandTotal)
                                .map(([platformKey, totals]) => {
                                    const isCheapest = platformKey === cheapestPlatform;
                                    const color = PLATFORM_COLORS[platformKey] || '#888';

                                    return (
                                        <div
                                            key={platformKey}
                                            className={`platform-total-card ${isCheapest ? 'cheapest-card' : ''}`}
                                        >
                                            <div className="platform-total-header">
                                                <div className="platform-total-name">
                                                    <span style={{
                                                        width: '8px', height: '8px', borderRadius: '50%', background: color,
                                                    }} />
                                                    {PLATFORM_LABELS[platformKey] || platformKey}
                                                    {isCheapest && <span className="savings-badge">✓ Cheapest</span>}
                                                </div>
                                                <div className="platform-total-amount" style={isCheapest ? { color: 'var(--cheapest)' } : {}}>
                                                    ₹{totals.grandTotal}
                                                </div>
                                            </div>

                                            <div className="fee-rows">
                                                <div className="fee-row">
                                                    <span className="fee-label">Items ({totals.itemCount})</span>
                                                    <span className="fee-amount">₹{totals.subtotal}</span>
                                                </div>
                                                <div className="fee-row">
                                                    <span className="fee-label">Delivery</span>
                                                    <span className={totals.deliveryFee === 0 ? 'fee-free' : 'fee-amount'}>
                                                        {totals.deliveryFee === 0 ? 'FREE' : `₹${totals.deliveryFee}`}
                                                    </span>
                                                </div>
                                                {totals.handlingCharge > 0 && (
                                                    <div className="fee-row">
                                                        <span className="fee-label">Handling</span>
                                                        <span className="fee-amount">₹{totals.handlingCharge}</span>
                                                    </div>
                                                )}
                                                {totals.platformFee > 0 && (
                                                    <div className="fee-row">
                                                        <span className="fee-label">Platform fee</span>
                                                        <span className="fee-amount">₹{totals.platformFee}</span>
                                                    </div>
                                                )}
                                                {totals.smallCartFee > 0 && (
                                                    <div className="fee-row">
                                                        <span className="fee-label">Small cart fee</span>
                                                        <span className="fee-amount">₹{totals.smallCartFee}</span>
                                                    </div>
                                                )}
                                                {totals.itemSavings > 0 && (
                                                    <div className="fee-row">
                                                        <span className="fee-label">Discount savings</span>
                                                        <span className="fee-free">−₹{totals.itemSavings}</span>
                                                    </div>
                                                )}
                                                {totals.amountForFreeDelivery > 0 && (
                                                    <div style={{
                                                        fontSize: '10px',
                                                        color: 'var(--warning)',
                                                        marginTop: '4px',
                                                    }}>
                                                        Add ₹{totals.amountForFreeDelivery.toFixed(0)} more for free delivery
                                                    </div>
                                                )}
                                                {totals.estimatedDelivery && (
                                                    <div className="fee-row" style={{ marginTop: '4px' }}>
                                                        <span className="fee-label">🕐 ETA</span>
                                                        <span className="fee-amount">{totals.estimatedDelivery}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
