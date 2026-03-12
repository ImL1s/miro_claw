#!/usr/bin/env node
/**
 * MiroFish Canvas — Local HTTP server for visual dashboard
 *
 * Usage (from CLI):
 *   mirofish canvas <simulation_id>
 *   mirofish canvas <simulation_id> --port=18790
 *
 * Features:
 * 1. Fetches report data from MiroFish API
 * 2. Injects data into HTML template
 * 3. Serves static dashboard + proxies API calls
 * 4. Auto-opens browser
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const { request, getBaseUrl } = require('./api.js');

const CANVAS_DIR = path.join(__dirname, '..', 'canvas');
const DEFAULT_PORT = 18790;

// MIME types for static files
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

/**
 * Launch the Canvas Dashboard server
 * @param {string} simId - Simulation ID
 * @param {Object} [opts]
 * @param {number} [opts.port] - HTTP server port (default: 18790)
 * @param {boolean} [opts.open] - Auto-open browser (default: true)
 */
async function launchCanvas(simId, opts = {}) {
    const port = opts.port || DEFAULT_PORT;
    const autoOpen = opts.open !== false;

    console.log(`\n🖥️  MiroFish Canvas Dashboard`);
    console.log(`   Simulation: ${simId}`);
    console.log(`   API: ${getBaseUrl()}`);

    // Fetch report data
    let reportData = null;
    try {
        console.log('   📊 Fetching report data...');
        const res = await request('GET', `/api/report/by-simulation/${simId}`);
        reportData = res.data || res;
        console.log(`   ✅ Report loaded: ${reportData.outline?.title || 'Untitled'}`);
    } catch (err) {
        console.log(`   ⚠️  Could not fetch report: ${err.message}`);
        console.log('   Dashboard will load without embedded data.');
    }

    // Create HTTP server
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);

        // API proxy — forward /api/* to MiroFish backend
        if (url.pathname.startsWith('/api/')) {
            return proxyRequest(req, res, url.pathname + url.search, port);
        }

        // Static files
        let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
        const fullPath = path.join(CANVAS_DIR, filePath);

        // Security: prevent path traversal
        if (!fullPath.startsWith(CANVAS_DIR)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        // Special: inject data into index.html
        if (filePath === '/index.html') {
            return serveInjectedHTML(res, fullPath, simId, reportData);
        }

        // Serve static
        const ext = path.extname(filePath);
        const mime = MIME[ext] || 'application/octet-stream';

        fs.readFile(fullPath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not Found');
                return;
            }
            res.writeHead(200, {
                'Content-Type': mime,
                'Cache-Control': 'no-cache',
            });
            res.end(data);
        });
    });

    server.listen(port, () => {
        const dashboardUrl = `http://localhost:${port}`;
        console.log(`\n   🌐 Dashboard: ${dashboardUrl}`);
        console.log('   Press Ctrl+C to stop\n');

        if (autoOpen) {
            openBrowser(dashboardUrl);
        }
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`   ❌ Port ${port} is already in use.`);
            console.error(`   Try: mirofish canvas ${simId} --port=${port + 1}`);
            process.exit(1);
        }
        throw err;
    });

    return server;
}

/**
 * Serve index.html with injected report data
 */
function serveInjectedHTML(res, htmlPath, simId, reportData) {
    fs.readFile(htmlPath, 'utf-8', (err, html) => {
        if (err) {
            res.writeHead(500);
            res.end('Failed to read template');
            return;
        }

        // Inject config and data before </head>
        // Use JSON.stringify for all values to prevent XSS
        const injection = `
<script>
window.__MIROFISH_API__ = ${JSON.stringify(getBaseUrl())};
window.__MIROFISH_SIM_ID__ = ${JSON.stringify(simId)};
${reportData ? `window.__MIROFISH_REPORT__ = ${JSON.stringify(reportData)};` : ''}
</script>
`;
        html = html.replace('</head>', injection + '</head>');

        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
        });
        res.end(html);
    });
}

/**
 * Proxy API requests to MiroFish backend
 */
function proxyRequest(clientReq, clientRes, apiPath, serverPort) {
    const baseUrl = new URL(getBaseUrl());
    const mod = baseUrl.protocol === 'https:' ? require('https') : http;

    let body = '';
    clientReq.on('data', c => body += c);
    clientReq.on('end', () => {
        const headers = { ...clientReq.headers };
        delete headers.host;

        const proxyReq = mod.request({
            hostname: baseUrl.hostname,
            port: baseUrl.port,
            path: apiPath,
            method: clientReq.method,
            headers,
            timeout: 300000,
        }, (proxyRes) => {
            clientRes.writeHead(proxyRes.statusCode, {
                ...proxyRes.headers,
                'Access-Control-Allow-Origin': `http://localhost:${serverPort}`,
            });
            proxyRes.pipe(clientRes);
        });

        proxyReq.on('error', (err) => {
            clientRes.writeHead(502);
            clientRes.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
        });

        if (body) proxyReq.write(body);
        proxyReq.end();
    });
}

/**
 * Open URL in default browser
 */
function openBrowser(url) {
    const platform = os.platform();
    try {
        if (platform === 'darwin') {
            execSync(`open "${url}"`, { stdio: 'ignore' });
        } else if (platform === 'linux') {
            execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
        } else if (platform === 'win32') {
            execSync(`start "${url}"`, { stdio: 'ignore' });
        }
    } catch { /* ignore */ }
}

/**
 * Generate HTML string (for embedding or testing)
 */
function generateHTML(reportData, simId) {
    const htmlPath = path.join(CANVAS_DIR, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');

    // Read and inline CSS (use callback to avoid $& interpretation)
    const cssPath = path.join(CANVAS_DIR, 'style.css');
    const css = fs.readFileSync(cssPath, 'utf-8');
    html = html.replace(
        '<link rel="stylesheet" href="style.css">',
        () => `<style>${css}</style>`
    );

    // Read and inline JS (use callback to avoid $& interpretation)
    const jsPath = path.join(CANVAS_DIR, 'app.js');
    const js = fs.readFileSync(jsPath, 'utf-8');
    html = html.replace(
        '<script src="app.js"></script>',
        () => `<script>${js}<\/script>`
    );

    // Inject data (use JSON.stringify for safety)
    const injection = `
<script>
window.__MIROFISH_API__ = ${JSON.stringify('http://localhost:5001')};
window.__MIROFISH_SIM_ID__ = ${JSON.stringify(simId || '')};
${reportData ? `window.__MIROFISH_REPORT__ = ${JSON.stringify(reportData)};` : ''}
</script>
`;
    html = html.replace('</head>', () => injection + '</head>');

    return html;
}

module.exports = { launchCanvas, generateHTML };
