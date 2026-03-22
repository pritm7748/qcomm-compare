import { useState, useEffect } from 'react';
import './index.css';
import { useLocation } from './hooks/useLocation';
import { useSearch } from './hooks/useSearch';
import { useCart } from './hooks/useCart';
import LocationPicker from './components/LocationPicker';
import SearchBar from './components/SearchBar';
import ProductGrid from './components/ProductGrid';
import CartPanel from './components/CartPanel';

const QUICK_SEARCHES = [
  { label: '🥛 Milk', query: 'milk' },
  { label: '🍞 Bread', query: 'bread' },
  { label: '🥚 Eggs', query: 'eggs' },
  { label: '🧈 Butter', query: 'butter' },
  { label: '🧅 Onion', query: 'onion' },
  { label: '🍚 Rice', query: 'rice' },
  { label: '🫒 Oil', query: 'cooking oil' },
  { label: '☕ Coffee', query: 'coffee' },
  { label: '🍌 Banana', query: 'banana' },
  { label: '🧃 Juice', query: 'juice' },
  { label: '🧀 Cheese', query: 'cheese' },
  { label: '🥔 Potato', query: 'potato' },
];

const PLATFORMS = [
  { id: 'blinkit', name: 'Blinkit', color: '#F7C948', time: '10 min' },
  { id: 'zepto', name: 'Zepto', color: '#8B5CF6', time: '10 min' },
  { id: 'instamart', name: 'Instamart', color: '#FC8019', time: '15 min' },
  { id: 'bigbasket', name: 'BigBasket', color: '#84C225', time: '30 min' },
  { id: 'flipkart_minutes', name: 'FK Minutes', color: '#2874F0', time: '14 min' },
  { id: 'jiomart', name: 'JioMart', color: '#1A73E8', time: '30 min' },
  { id: 'amazon_now', name: 'Amazon Fresh', color: '#FF9900', time: '20 min' },
];

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('qcomm-theme') || 'dark');
  const { location, setLocation, loading: locationLoading } = useLocation();
  const {
    query, results, searching, platformStates, totalProducts,
    search, clearResults,
  } = useSearch();
  const {
    items, itemCount, itemsByPlatform, isOpen, cartTotals, cheapestPlatform,
    calculating, addItem, removeItem, updateQty, clearCart, toggleCart, setIsOpen,
  } = useCart();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('qcomm-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <div className="app">
      {/* ─── Header ─── */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-icon">Q</div>
            <div>
              <div className="logo-text">QComm</div>
              <div className="logo-sub">Price Comparison</div>
            </div>
          </div>

          <LocationPicker
            location={location}
            onSetLocation={setLocation}
            loading={locationLoading}
          />

          <div className="header-right">
            <div className="platform-indicator">
              <span className="indicator-dot" style={{ background: location ? 'var(--success)' : 'var(--warning)' }} />
              <span>{PLATFORMS.length} platforms</span>
            </div>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="app-container">
        {/* Search Section */}
        <SearchBar
          onSearch={search}
          searching={searching}
          location={location}
          platformStates={platformStates}
        />

        {/* Welcome State — No Location */}
        {!location && !query && (
          <div className="hero-section">
            <div className="hero-bg-glow" />
            <div className="empty-state">
              <div className="empty-state-icon">📍</div>
              <h3>Set your delivery location</h3>
              <p>
                Prices, availability, and delivery fees vary by exact location.
                Click the location bar above to enter your area.
              </p>
            </div>
          </div>
        )}

        {/* Location set — Show quick search */}
        {location && !query && Object.keys(results).length === 0 && (
          <div className="hero-section">
            <div className="hero-bg-glow" />
            <div className="empty-state">
              <div className="empty-state-icon">⚡</div>
              <h3>Compare prices instantly</h3>
              <p>Search any grocery item to compare prices across all major quick commerce platforms in your area.</p>
            </div>

            {/* Quick search chips */}
            <div className="quick-search">
              <div className="quick-search-label">Popular searches</div>
              <div className="quick-chips">
                {QUICK_SEARCHES.map(item => (
                  <button
                    key={item.query}
                    className="quick-chip"
                    onClick={() => search(item.query)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Platform highlights */}
            <div className="platform-showcase">
              {PLATFORMS.map(p => (
                <div key={p.id} className="platform-card">
                  <div className="platform-card-dot" style={{ background: p.color }} />
                  <div className="platform-card-name">{p.name}</div>
                  <div className="platform-card-time">~{p.time}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Product Results */}
        <ProductGrid
          results={results}
          searching={searching}
          totalProducts={totalProducts}
          onAddToCart={addItem}
          searchQuery={query}
        />
      </main>

      {/* ─── Cart FAB ─── */}
      <button className="cart-toggle" onClick={toggleCart}>
        🛒
        {itemCount > 0 && <span className="badge">{itemCount}</span>}
      </button>

      {/* ─── Cart Panel ─── */}
      <CartPanel
        items={items}
        itemCount={itemCount}
        itemsByPlatform={itemsByPlatform}
        isOpen={isOpen}
        cartTotals={cartTotals}
        cheapestPlatform={cheapestPlatform}
        calculating={calculating}
        onUpdateQty={updateQty}
        onRemoveItem={removeItem}
        onClearCart={clearCart}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
}
