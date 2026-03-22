import { useState, useCallback, useRef, useEffect } from 'react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
const WS_URL = API_URL.replace(/^http/, 'ws');

export function useSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState({});
    const [searching, setSearching] = useState(false);
    const [platformStates, setPlatformStates] = useState({});
    const [totalProducts, setTotalProducts] = useState(0);
    const wsRef = useRef(null);
    const reconnectRef = useRef(null);

    // Connect WebSocket
    const connectWs = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            const ws = new WebSocket(WS_URL);

            ws.onopen = () => {
                console.log('WebSocket connected');
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    switch (data.type) {
                        case 'search_start':
                            setSearching(true);
                            setResults({});
                            setPlatformStates({});
                            setTotalProducts(0);
                            break;

                        case 'platform_loading':
                            setPlatformStates(prev => ({
                                ...prev,
                                [data.platform.id]: 'loading',
                            }));
                            break;

                        case 'platform_results':
                            setResults(prev => ({
                                ...prev,
                                [data.platform.id]: {
                                    platform: data.platform,
                                    products: data.products,
                                    count: data.count,
                                    responseTime: data.responseTime,
                                    error: data.error,
                                },
                            }));
                            setPlatformStates(prev => ({
                                ...prev,
                                [data.platform.id]: data.error ? 'error' : 'loaded',
                            }));
                            setTotalProducts(prev => prev + (data.count || 0));
                            break;

                        case 'platform_error':
                            setPlatformStates(prev => ({
                                ...prev,
                                [data.platform.id]: 'error',
                            }));
                            setResults(prev => ({
                                ...prev,
                                [data.platform.id]: {
                                    platform: data.platform,
                                    products: [],
                                    count: 0,
                                    error: data.error,
                                },
                            }));
                            break;

                        case 'search_complete':
                            setSearching(false);
                            break;

                        case 'error':
                            console.error('WS error:', data.message);
                            setSearching(false);
                            break;
                    }
                } catch (err) {
                    console.error('WS message parse error:', err);
                }
            };

            ws.onclose = () => {
                console.log('WebSocket disconnected, reconnecting...');
                reconnectRef.current = setTimeout(connectWs, 2000);
            };

            ws.onerror = () => {
                ws.close();
            };

            wsRef.current = ws;
        } catch (err) {
            console.error('WS connection error:', err);
            reconnectRef.current = setTimeout(connectWs, 3000);
        }
    }, []);

    useEffect(() => {
        connectWs();
        return () => {
            wsRef.current?.close();
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
        };
    }, [connectWs]);

    // Search via WebSocket (real-time streaming)
    const searchRealtime = useCallback((q) => {
        if (!q.trim()) return;
        setQuery(q);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'search', query: q }));
        } else {
            // Fallback to REST
            searchRest(q);
        }
    }, []);

    // Fallback REST search
    const searchRest = useCallback(async (q) => {
        setQuery(q);
        setSearching(true);
        setResults({});
        setPlatformStates({});

        try {
            const res = await fetch(`${API_URL}/api/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q }),
            });

            const data = await res.json();

            if (data.results) {
                setResults(data.results);
                setTotalProducts(data.totalProducts || 0);

                const states = {};
                for (const [key, result] of Object.entries(data.results)) {
                    states[key] = result.error ? 'error' : 'loaded';
                }
                setPlatformStates(states);
            }
        } catch (err) {
            console.error('REST search error:', err);
        } finally {
            setSearching(false);
        }
    }, []);

    const clearResults = useCallback(() => {
        setQuery('');
        setResults({});
        setPlatformStates({});
        setTotalProducts(0);
    }, []);

    return {
        query,
        results,
        searching,
        platformStates,
        totalProducts,
        search: searchRealtime,
        searchRest,
        clearResults,
        setQuery,
    };
}
