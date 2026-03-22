/**
 * Shared Puppeteer Browser Manager with Stealth Mode
 * 
 * Two browser instances:
 * - browser: For fast scraping platforms (Blinkit, Zepto, BigBasket, etc.) — blocks images/fonts
 * - fullBrowser: For heavy-anti-bot platforms (FK Minutes, Instamart) — no resource blocking
 * Separated to prevent concurrent page contention between modes.
 */
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

let browser = null;
let fullBrowser = null;

const LAUNCH_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-features=IsolateOrigins',
    '--disable-site-isolation-trials',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1366,768',
    '--lang=en-US,en',
];

export async function getBrowser() {
    if (!browser || !browser.isConnected()) {
        browser = await puppeteer.launch({
            headless: 'new',
            args: LAUNCH_ARGS,
            defaultViewport: { width: 1366, height: 768 },
        });
        console.log('[browser] Stealth browser launched');
    }
    return browser;
}

async function getFullBrowser() {
    if (!fullBrowser || !fullBrowser.isConnected()) {
        fullBrowser = await puppeteer.launch({
            headless: 'new',
            args: LAUNCH_ARGS,
            defaultViewport: { width: 1366, height: 768 },
        });
        console.log('[browser] Full-resource browser launched');
    }
    return fullBrowser;
}

async function setupPage(page) {
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {}, loadTimes: () => { }, csi: () => { } };
        const origQuery = window.navigator.permissions?.query;
        if (origQuery) {
            window.navigator.permissions.query = (parameters) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : origQuery(parameters);
        }
        Object.defineProperty(navigator, 'plugins', {
            get: () => [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: '' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
                { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
            ],
        });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
}

export async function newPage() {
    const b = await getBrowser();
    const page = await b.newPage();
    await setupPage(page);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const type = req.resourceType();
        if (['image', 'font', 'media'].includes(type)) req.abort();
        else req.continue();
    });
    page.setDefaultNavigationTimeout(18000);
    page.setDefaultTimeout(12000);
    return page;
}

/**
 * Separate browser instance — no resource blocking.
 * Used for platforms that need full resource loading (FK Minutes, Instamart).
 */
export async function newFullPage() {
    const b = await getFullBrowser();
    const page = await b.newPage();
    await setupPage(page);
    page.setDefaultNavigationTimeout(25000);
    page.setDefaultTimeout(15000);
    return page;
}

/**
 * Real Chrome browser — uses the system-installed Chrome binary.
 * This avoids TLS fingerprinting detection by CloudFront/AWS WAF
 * that flags Puppeteer's bundled Chromium as 'SignalAutomatedBrowser'.
 */
let realChromeBrowser = null;
const CHROME_PATHS = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
];

export async function newRealChromePage() {
    if (!realChromeBrowser || !realChromeBrowser.isConnected()) {
        let chromePath = null;
        for (const p of CHROME_PATHS) {
            try {
                const { existsSync } = await import('fs');
                if (existsSync(p)) { chromePath = p; break; }
            } catch { }
        }
        realChromeBrowser = await puppeteer.launch({
            headless: 'new',
            executablePath: chromePath || undefined,
            args: [
                ...LAUNCH_ARGS,
                '--user-data-dir=' + (process.env.TEMP || '/tmp') + '/qcomm-chrome-profile',
            ],
            defaultViewport: { width: 1366, height: 768 },
        });
        console.log(`[browser] Real Chrome launched${chromePath ? ` (${chromePath.split('\\').pop()})` : ''}`);
    }
    const page = await realChromeBrowser.newPage();
    await setupPage(page);
    page.setDefaultNavigationTimeout(25000);
    page.setDefaultTimeout(15000);
    return page;
}

export async function closeBrowser() {
    if (browser) { await browser.close().catch(() => { }); browser = null; }
    if (fullBrowser) { await fullBrowser.close().catch(() => { }); fullBrowser = null; }
    if (realChromeBrowser) { await realChromeBrowser.close().catch(() => { }); realChromeBrowser = null; }
}
