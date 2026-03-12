#!/usr/bin/env node
/**
 * MiroFish 推播通知模組（零依賴）
 *
 * 支援：
 * - macOS: osascript display notification
 * - Linux: notify-send
 * - Windows: powershell toast
 * - OpenClaw Gateway: HTTP POST to message endpoint (optional)
 */
const { execFileSync } = require('child_process');
const http = require('http');
const https = require('https');
const os = require('os');

/**
 * 發送系統通知
 * @param {Object} opts
 * @param {string} opts.title - 通知標題
 * @param {string} opts.body - 通知內容
 * @param {string} [opts.subtitle] - 副標題（macOS only）
 * @param {string} [opts.url] - 點擊後開啟的 URL
 */
function sendSystemNotification({ title, body, subtitle, url }) {
    const platform = os.platform();

    try {
        if (platform === 'darwin') {
            // macOS — osascript (execFileSync avoids shell injection)
            const parts = [
                `display notification "${escapeAppleScript(body)}"`,
                `with title "${escapeAppleScript(title)}"`,
            ];
            if (subtitle) {
                parts.push(`subtitle "${escapeAppleScript(subtitle)}"`);
            }
            execFileSync('osascript', ['-e', parts.join(' ')], { stdio: 'ignore' });
        } else if (platform === 'linux') {
            // Linux — notify-send (args as array, no shell)
            execFileSync('notify-send', [title, body], { stdio: 'ignore' });
        } else if (platform === 'win32') {
            // Windows — powershell toast (pass data via env vars to avoid injection)
            const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$textNodes = $template.GetElementsByTagName('text')
$textNodes.Item(0).AppendChild($template.CreateTextNode($env:MIROFISH_TOAST_TITLE))
$textNodes.Item(1).AppendChild($template.CreateTextNode($env:MIROFISH_TOAST_BODY))
$toast = [Windows.UI.Notifications.ToastNotification]::new($template)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('MiroFish').Show($toast)
            `.trim();
            execFileSync('powershell', ['-Command', ps], {
                stdio: 'ignore',
                env: { ...process.env, MIROFISH_TOAST_TITLE: title, MIROFISH_TOAST_BODY: body },
            });
        }
    } catch {
        // Silent fail — notification is nice-to-have
    }

    // Open URL if provided
    if (url) {
        try {
            if (platform === 'darwin') {
                execFileSync('open', [url], { stdio: 'ignore' });
            } else if (platform === 'linux') {
                execFileSync('xdg-open', [url], { stdio: 'ignore' });
            }
        } catch { /* ignore */ }
    }
}

/**
 * 透過 OpenClaw Gateway 推播通知
 * @param {Object} opts
 * @param {string} opts.message - 推播訊息（支援 Markdown）
 * @param {string} [opts.gatewayUrl] - Gateway URL (default: http://localhost:18787)
 * @returns {Promise<boolean>} 是否成功
 */
async function sendGatewayNotification({ message, gatewayUrl }) {
    const url = gatewayUrl || process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18787';

    return new Promise((resolve) => {
        try {
            const endpoint = new URL('/api/message', url);
            const mod = endpoint.protocol === 'https:' ? https : http;
            const payload = JSON.stringify({ message });

            const req = mod.request(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                },
                timeout: 5000,
            }, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => resolve(res.statusCode < 400));
            });

            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.write(payload);
            req.end();
        } catch {
            resolve(false);
        }
    });
}

/**
 * 推演完成後發送所有通知
 * @param {Object} opts
 * @param {string} opts.topic - 推演主題
 * @param {string} opts.simId - Simulation ID
 * @param {number} opts.sections - 報告章節數
 * @param {number} [opts.canvasPort] - Canvas server port
 * @param {string} [opts.reportId] - Report ID
 * @param {string} [opts.reportSummary] - Report summary text
 */
async function notifyPredictionComplete({ topic, simId, sections, canvasPort, reportId, reportSummary }) {
    const shortTopic = topic.length > 40 ? topic.slice(0, 40) + '…' : topic;
    const title = '🐟 MiroFish 推演完成';
    const body = `「${shortTopic}」推演已完成，產生了 ${sections} 個章節`;
    const canvasUrl = canvasPort ? `http://localhost:${canvasPort}` : null;

    // 1. System notification
    sendSystemNotification({
        title,
        body,
        subtitle: `Simulation: ${simId}`,
        url: canvasUrl,
    });

    // 2. OpenClaw Gateway notification (attempt, don't fail)
    // Use user-friendly format — DC/TG users interact via agent, not CLI
    const summaryBlock = reportSummary
        ? reportSummary.split('\n').map(line => `> ${line}`).join('\n')
        : '';

    const gatewayMsg = [
        `🐟 **MiroFish 推演完成**`,
        '',
        `> **主題:** ${shortTopic}`,
        `> **Report ID:** \`${reportId || 'N/A'}\``,
        `> **Simulation:** \`${simId}\``,
        `> **章節數:** ${sections}`,
        '',
        summaryBlock ? `📋 **報告摘要:**\n${summaryBlock}\n` : '',
        `💬 **想了解更多？** 直接在聊天中提問即可，例如：`,
        `• 「這個推演的主要結論是什麼？」`,
        `• 「哪些風險最需要注意？」`,
        `• 「各方利益相關者的反應如何？」`,
    ].filter(Boolean).join('\n');

    const gatewaySent = await sendGatewayNotification({ message: gatewayMsg });
    if (gatewaySent) {
        console.log('   📱 OpenClaw Gateway 推播已發送');
    }

    console.log('   🔔 系統通知已發送');
}

// --- Escape helpers ---

function escapeAppleScript(str) {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}


module.exports = {
    sendSystemNotification,
    sendGatewayNotification,
    notifyPredictionComplete,
};
