const { describe, it } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const { launchCanvas } = require('../lib/canvas.js');

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(() => resolve(address.port));
        });
        server.on('error', reject);
    });
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
    });
}

describe('Canvas proxy', () => {
    it('proxies API requests and keeps Canvas CORS locked to its own localhost origin', async () => {
        const backendPort = await getFreePort();
        const canvasPort = await getFreePort();
        const previousBaseUrl = process.env.MIROFISH_URL;

        const backend = http.createServer((req, res) => {
            if (req.url === '/api/report/by-simulation/sim-test') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    report_id: 'rpt-test',
                    outline: { title: 'Test Report' },
                    markdown_content: '# Test Report',
                }));
                return;
            }

            if (req.url === '/api/ping') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                return;
            }

            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'not found' }));
        });

        await new Promise((resolve, reject) => {
            backend.listen(backendPort, '127.0.0.1', (err) => err ? reject(err) : resolve());
        });

        process.env.MIROFISH_URL = `http://127.0.0.1:${backendPort}`;

        let canvas;
        try {
            canvas = await launchCanvas('sim-test', { port: canvasPort, open: false });
            const response = await httpGet(`http://localhost:${canvasPort}/api/ping`);

            assert.strictEqual(response.statusCode, 200);
            assert.deepStrictEqual(JSON.parse(response.body), { ok: true });
            assert.strictEqual(
                response.headers['access-control-allow-origin'],
                `http://localhost:${canvasPort}`
            );
        } finally {
            if (canvas) {
                await new Promise((resolve) => canvas.close(() => resolve()));
            }
            await new Promise((resolve) => backend.close(() => resolve()));

            if (previousBaseUrl === undefined) {
                delete process.env.MIROFISH_URL;
            } else {
                process.env.MIROFISH_URL = previousBaseUrl;
            }
        }
    });
});
