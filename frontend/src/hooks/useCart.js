import { useState, useCallback, useEffect } from 'react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

export function useCart() {
    const [items, setItems] = useState(() => {
        try {
            const saved = localStorage.getItem('qcomm_cart');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [isOpen, setIsOpen] = useState(false);
    const [cartTotals, setCartTotals] = useState(null);
    const [cheapestPlatform, setCheapestPlatform] = useState(null);
    const [calculating, setCalculating] = useState(false);

    // Persist to localStorage
    useEffect(() => {
        localStorage.setItem('qcomm_cart', JSON.stringify(items));
    }, [items]);

    const addItem = useCallback((product) => {
        setItems(prev => {
            const existingIdx = prev.findIndex(
                i => i.id === product.id && i.platform === product.platform
            );

            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = {
                    ...updated[existingIdx],
                    qty: (updated[existingIdx].qty || 1) + 1,
                };
                return updated;
            }

            return [...prev, { ...product, qty: 1 }];
        });
    }, []);

    const removeItem = useCallback((productId, platform) => {
        setItems(prev => prev.filter(
            i => !(i.id === productId && i.platform === platform)
        ));
    }, []);

    const updateQty = useCallback((productId, platform, qty) => {
        if (qty <= 0) {
            removeItem(productId, platform);
            return;
        }
        setItems(prev => prev.map(i =>
            i.id === productId && i.platform === platform
                ? { ...i, qty }
                : i
        ));
    }, [removeItem]);

    const clearCart = useCallback(() => {
        setItems([]);
        setCartTotals(null);
        setCheapestPlatform(null);
    }, []);

    const toggleCart = useCallback(() => setIsOpen(prev => !prev), []);

    // Calculate cart totals with fees
    const calculateTotals = useCallback(async () => {
        if (items.length === 0) {
            setCartTotals(null);
            setCheapestPlatform(null);
            return;
        }

        setCalculating(true);
        try {
            const res = await fetch(`${API_URL}/api/calculate-cart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items }),
            });

            const data = await res.json();
            setCartTotals(data.cartTotals || null);
            setCheapestPlatform(data.cheapestPlatform || null);
        } catch (err) {
            console.error('Cart calculation error:', err);
        } finally {
            setCalculating(false);
        }
    }, [items]);

    // Recalculate whenever items change
    useEffect(() => {
        calculateTotals();
    }, [items, calculateTotals]);

    const itemCount = items.reduce((sum, i) => sum + (i.qty || 1), 0);

    // Group items by platform
    const itemsByPlatform = items.reduce((acc, item) => {
        if (!acc[item.platform]) acc[item.platform] = [];
        acc[item.platform].push(item);
        return acc;
    }, {});

    return {
        items,
        itemCount,
        itemsByPlatform,
        isOpen,
        cartTotals,
        cheapestPlatform,
        calculating,
        addItem,
        removeItem,
        updateQty,
        clearCart,
        toggleCart,
        setIsOpen,
    };
}
