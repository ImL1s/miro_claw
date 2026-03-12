/**
 * MiroFish Canvas Dashboard — Frontend Logic
 *
 * Handles:
 * - Loading report data from embedded JSON or API
 * - Rendering report content as Markdown
 * - Section navigation
 * - Key event highlights (A2UI concept)
 * - Chat with Report Agent
 * - Agent interview panel
 */

// --- Config ---
const API_BASE = window.__MIROFISH_API__ || 'http://localhost:5001';
const SIM_ID = window.__MIROFISH_SIM_ID__ || '';

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    // Configure marked with highlight.js
    marked.setOptions({
        gfm: true,
        breaks: true,
        highlight: function(code, lang) {
            if (typeof hljs !== 'undefined') {
                if (lang && hljs.getLanguage(lang)) {
                    try { return hljs.highlight(code, { language: lang }).value; } catch {}
                }
                try { return hljs.highlightAuto(code).value; } catch {}
            }
            return code;
        },
    });

    initDashboard();
    initChat();
    initA2UIBridge();
});

// --- Dashboard ---

async function initDashboard() {
    // Check for embedded data first (injected by canvas.js server)
    if (window.__MIROFISH_REPORT__) {
        renderReport(window.__MIROFISH_REPORT__);
        return;
    }

    // Otherwise fetch from API
    if (!SIM_ID) {
        showError('No simulation ID provided');
        return;
    }

    document.getElementById('sim-id').textContent = SIM_ID;
    document.getElementById('report-status').textContent = 'Loading...';

    try {
        const res = await fetchAPI(`/api/report/by-simulation/${SIM_ID}`);
        if (res.success && res.data) {
            renderReport(res.data);
        } else {
            showError(res.error || 'Report not found');
        }
    } catch (err) {
        showError(`Failed to load report: ${err.message}`);
    }
}

function renderReport(report) {
    const outline = report.outline;
    const markdown = report.markdown_content || '';

    // Header meta
    document.getElementById('sim-id').textContent = report.simulation_id || SIM_ID;
    document.getElementById('report-status').textContent = report.status || 'completed';
    document.getElementById('report-id').textContent = report.report_id || '';

    // Report card
    document.getElementById('report-title').textContent = outline?.title || 'Prediction Report';
    document.getElementById('report-summary').textContent = outline?.summary || '';

    const sections = outline?.sections || [];
    document.getElementById('stat-sections').textContent = sections.length;

    // Section navigation
    renderSectionNav(sections);

    // Key events (extract from markdown)
    renderHighlights(markdown);

    // Main content
    renderContent(markdown, sections);
}

function renderSectionNav(sections) {
    const nav = document.getElementById('section-nav');
    nav.innerHTML = '';

    sections.forEach((section, i) => {
        const item = document.createElement('div');
        item.className = 'nav-item' + (i === 0 ? ' active' : '');
        item.innerHTML = `
            <span class="nav-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="nav-title">${escapeHTML(section.title)}</span>
        `;
        item.addEventListener('click', () => {
            // Update active state
            nav.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // Scroll to section
            const sectionEl = document.getElementById(`section-${i}`);
            if (sectionEl) {
                sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
        nav.appendChild(item);
    });
}

function renderHighlights(markdown) {
    const bar = document.getElementById('highlight-bar');
    const highlights = extractKeyEvents(markdown);

    if (highlights.length === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.innerHTML = '';
    highlights.forEach(h => {
        const chip = document.createElement('span');
        chip.className = `highlight-chip ${h.type}`;
        chip.innerHTML = `${h.icon} ${escapeHTML(h.text)}`;
        bar.appendChild(chip);
    });
}

function extractKeyEvents(markdown) {
    const events = [];
    const lines = markdown.split('\n');

    // Look for sentiment patterns
    const bullPatterns = [/看多/g, /上漲/g, /利多/g, /突破/g, /bullish/gi, /rally/gi, /surge/gi];
    const bearPatterns = [/看空/g, /下跌/g, /利空/g, /崩盤/g, /bearish/gi, /crash/gi, /dump/gi];
    const infoPatterns = [/關鍵/g, /重要/g, /核心/g, /critical/gi, /key finding/gi];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        for (const p of bullPatterns) {
            if (p.test(trimmed) && events.length < 8) {
                const snippet = trimmed.slice(0, 50);
                events.push({ type: 'bull', icon: '📈', text: snippet });
                break;
            }
            p.lastIndex = 0; // reset regex
        }
        for (const p of bearPatterns) {
            if (p.test(trimmed) && events.length < 8) {
                const snippet = trimmed.slice(0, 50);
                events.push({ type: 'bear', icon: '📉', text: snippet });
                break;
            }
            p.lastIndex = 0;
        }
        for (const p of infoPatterns) {
            if (p.test(trimmed) && events.length < 8) {
                const snippet = trimmed.slice(0, 50);
                events.push({ type: 'info', icon: '💡', text: snippet });
                break;
            }
            p.lastIndex = 0;
        }

        if (events.length >= 8) break;
    }

    // Deduplicate by text
    const seen = new Set();
    return events.filter(e => {
        if (seen.has(e.text)) return false;
        seen.add(e.text);
        return true;
    }).slice(0, 6);
}

function renderContent(markdown, sections) {
    const container = document.getElementById('report-content');

    if (!markdown) {
        container.innerHTML = '<p class="loading-state">No report content available.</p>';
        return;
    }

    // Split by sections if possible, wrap each in a div with ID
    let html = '';
    if (sections.length > 0) {
        // Try to split markdown by section headers
        const parts = splitBySections(markdown, sections);
        parts.forEach((part, i) => {
            html += `<div class="report-section" id="section-${i}">`;
            html += marked.parse(part);
            html += `</div>`;
        });
    } else {
        html = marked.parse(markdown);
    }

    container.innerHTML = html;

    // Apply syntax highlighting to any code blocks
    if (typeof hljs !== 'undefined') {
        container.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
    }
}

function splitBySections(markdown, sections) {
    const headers = sections.map(s => s.title);
    const parts = [];
    let remaining = markdown;

    for (let i = 0; i < headers.length; i++) {
        const nextHeader = i < headers.length - 1 ? headers[i + 1] : null;

        if (nextHeader) {
            // Find the next section header in markdown
            const patterns = [
                new RegExp(`^##\\s+.*${escapeRegex(nextHeader)}`, 'mi'),
                new RegExp(`^#\\s+.*${escapeRegex(nextHeader)}`, 'mi'),
            ];

            let splitIdx = -1;
            for (const p of patterns) {
                const m = remaining.search(p);
                if (m > 0) { splitIdx = m; break; }
            }

            if (splitIdx > 0) {
                parts.push(remaining.slice(0, splitIdx));
                remaining = remaining.slice(splitIdx);
            } else {
                parts.push(remaining);
                remaining = '';
                break;
            }
        } else {
            parts.push(remaining);
        }
    }

    // If we didn't split at all, return the whole markdown
    if (parts.length === 0) parts.push(markdown);

    return parts;
}

// --- Chat ---

function initChat() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    const toggle = document.getElementById('chat-toggle');
    const panel = document.getElementById('chat-panel');

    // Toggle collapse
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('collapsed');
    });

    document.querySelector('.chat-header').addEventListener('click', () => {
        panel.classList.toggle('collapsed');
    });

    // Send message
    const doSend = async () => {
        const msg = input.value.trim();
        if (!msg || !SIM_ID) return;
        input.value = '';
        sendBtn.disabled = true;

        addChatMessage('user', msg);

        try {
            const res = await fetchAPI('/api/report/chat', {
                method: 'POST',
                body: JSON.stringify({
                    simulation_id: SIM_ID,
                    message: msg,
                }),
            });

            const data = res.data || res;
            const reply = data.response || data.message || JSON.stringify(data);
            addChatMessage('agent', reply);
        } catch (err) {
            addChatMessage('agent', `❌ Error: ${err.message}`);
        }

        sendBtn.disabled = false;
        input.focus();
    };

    sendBtn.addEventListener('click', doSend);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            doSend();
        }
    });

    // Quick action chips
    document.querySelectorAll('.action-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            input.value = chip.dataset.question;
            doSend();
        });
    });
}

function addChatMessage(role, content) {
    const messages = document.getElementById('chat-messages');

    // Remove hint
    const hint = messages.querySelector('.chat-hint');
    if (hint) hint.remove();

    const msg = document.createElement('div');
    msg.className = `chat-msg ${role}`;

    if (role === 'agent') {
        // Parse markdown in agent responses
        msg.innerHTML = `<div class="bubble">${marked.parse(content)}</div>`;
    } else {
        msg.innerHTML = `<div class="bubble">${escapeHTML(content)}</div>`;
    }

    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
}

// --- Utilities ---

async function fetchAPI(path, opts = {}) {
    const url = API_BASE + path;
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
    });
    return res.json();
}

function showError(msg) {
    document.getElementById('report-content').innerHTML = `
        <div class="loading-state">
            <p style="color: var(--danger);">❌ ${escapeHTML(msg)}</p>
        </div>
    `;
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- A2UI Mobile Bridge ---

function initA2UIBridge() {
    // Detect native WebView environments
    const isFlutterWebView = typeof window.flutter_inappwebview !== 'undefined';
    const isWKWebView = typeof window.webkit !== 'undefined' && window.webkit.messageHandlers;
    const isNativeEnv = isFlutterWebView || isWKWebView;

    if (!isNativeEnv) return; // Only show on mobile native WebViews

    // Create action bar
    const actionBar = document.createElement('div');
    actionBar.className = 'a2ui-action-bar';
    actionBar.innerHTML = `
        <button class="a2ui-btn" data-action="share_report">
            <span class="a2ui-icon">📤</span>
            <span>分享報告</span>
        </button>
        <button class="a2ui-btn" data-action="save_screenshot">
            <span class="a2ui-icon">📸</span>
            <span>截圖儲存</span>
        </button>
        <button class="a2ui-btn a2ui-btn-primary" data-action="new_prediction">
            <span class="a2ui-icon">🐟</span>
            <span>新推演</span>
        </button>
    `;

    // Insert after header
    const header = document.querySelector('.app-header');
    if (header && header.parentNode) {
        header.parentNode.insertBefore(actionBar, header.nextSibling);
    }

    // Handle button clicks
    actionBar.querySelectorAll('.a2ui-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const payload = {
                action,
                simId: SIM_ID,
                reportId: document.getElementById('report-id')?.textContent || '',
                topic: document.getElementById('report-title')?.textContent || '',
                ts: Date.now(),
            };

            sendNativeMessage(payload);
        });
    });
}

function sendNativeMessage(payload) {
    // Flutter InAppWebView
    if (window.flutter_inappwebview) {
        window.flutter_inappwebview.callHandler('onActionToken', JSON.stringify(payload));
        return;
    }

    // WKWebView (iOS native)
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.onActionToken) {
        window.webkit.messageHandlers.onActionToken.postMessage(payload);
        return;
    }

    // Fallback: postMessage to parent
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'mirofish:action', ...payload }, window.location.origin);
    }
}
