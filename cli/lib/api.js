#!/usr/bin/env node
/**
 * MiroFish API Client — 共用 HTTP 模組（零依賴）
 */
const http = require('http');
const https = require('https');

const DEFAULT_URL = 'http://localhost:5001';

function getBaseUrl() {
    return process.env.MIROFISH_URL || DEFAULT_URL;
}

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, getBaseUrl());
        const mod = url.protocol === 'https:' ? https : http;
        const headers = {};
        let payload = null;

        if (body) {
            payload = JSON.stringify(body);
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = mod.request(url, { method, headers, timeout: 300000 }, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject(new Error(`API ${res.statusCode}: ${JSON.stringify(json)}`));
                        return;
                    }
                    resolve(json);
                } catch {
                    if (res.statusCode >= 400) {
                        reject(new Error(`API ${res.statusCode}: ${data}`));
                        return;
                    }
                    resolve(data);
                }
            });
        });

        req.on('error', (e) => reject(new Error(`Connection failed: ${e.message}`)));
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout (5min)')); });
        if (payload) req.write(payload);
        req.end();
    });
}

function formDataUpload(path, fields, filePath, fileFieldName = 'file') {
    const fs = require('fs');
    const pathMod = require('path');
    return new Promise((resolve, reject) => {
        const boundary = '----MiroFishBoundary' + Date.now();
        const url = new URL(path, getBaseUrl());
        const mod = url.protocol === 'https:' ? https : http;

        let body = '';
        for (const [key, val] of Object.entries(fields)) {
            body += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`;
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const fileName = pathMod.basename(filePath);
        body += `--${boundary}\r\nContent-Disposition: form-data; name="${fileFieldName}"; filename="${fileName}"\r\nContent-Type: text/plain\r\n\r\n${fileContent}\r\n`;
        body += `--${boundary}--\r\n`;

        const req = mod.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': Buffer.byteLength(body),
            },
        }, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { resolve(data); }
            });
        });

        req.on('error', (e) => reject(new Error(`Upload failed: ${e.message}`)));
        req.write(body);
        req.end();
    });
}

// --- High-level Report API helpers ---

/** Fetch report by simulation ID */
function getReportBySimulation(simId) {
    return request('GET', `/api/report/by-simulation/${simId}`);
}

/** Fetch report sections (incremental) */
function getReportSections(reportId) {
    return request('GET', `/api/report/${reportId}/sections`);
}

/** Fetch report generation progress */
function getReportProgress(reportId) {
    return request('GET', `/api/report/${reportId}/progress`);
}

/** Fetch agent execution log (incremental) */
function getAgentLog(reportId, fromLine = 0) {
    return request('GET', `/api/report/${reportId}/agent-log?from_line=${fromLine}`);
}

/** Chat with Report Agent */
function chatWithAgent(simId, message, chatHistory = []) {
    return request('POST', '/api/report/chat', {
        simulation_id: simId,
        message,
        chat_history: chatHistory,
    });
}

/** Interview a specific simulation Agent */
function interviewAgent(simId, agentId, prompt) {
    return request('POST', '/api/simulation/interview', {
        simulation_id: simId,
        agent_id: agentId,
        prompt,
    });
}

/** Check report status for a simulation */
function checkReportStatus(simId) {
    return request('GET', `/api/report/check/${simId}`);
}

module.exports = {
    request,
    formDataUpload,
    getBaseUrl,
    getReportBySimulation,
    getReportSections,
    getReportProgress,
    getAgentLog,
    chatWithAgent,
    interviewAgent,
    checkReportStatus,
};
