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

export default function ProductCard({ product, isCheapest, color, onAddToCart }) {
    const isAvailable = product.available !== false;

    return (
        <div className={`price-cell ${isCheapest ? 'cheapest' : ''} ${!isAvailable ? 'unavailable' : ''}`}>
            <div className="price-platform">
                <span
                    className="platform-dot"
                    style={{ background: color }}
                />
                {PLATFORM_LABELS[product.platform] || product.platform}
            </div>

            {isAvailable ? (
                <>
                    <div className="price-amount">
                        <span className="price-current">₹{product.price}</span>
                        {product.mrp > product.price && (
                            <span className="price-mrp">₹{product.mrp}</span>
                        )}
                    </div>

                    {product.discountPercent > 0 && (
                        <span className="price-discount">{product.discountPercent}% off</span>
                    )}

                    {product.deliveryEta && (
                        <div className="price-eta">🕐 {product.deliveryEta}</div>
                    )}

                    {product.offer && (
                        <div style={{ fontSize: '10px', color: 'var(--warning)', marginTop: '2px' }}>
                            {product.offer}
                        </div>
                    )}

                    <button
                        className="add-btn"
                        onClick={() => onAddToCart(product)}
                    >
                        + Add to Cart
                    </button>
                </>
            ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
                    Out of stock
                </div>
            )}
        </div>
    );
}
