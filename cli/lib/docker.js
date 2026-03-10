#!/usr/bin/env node
/**
 * MiroFish backend 生命週期管理
 *
 * 策略：
 * 1. Docker 優先（跨平台、乾淨隔離）
 * 2. Docker image 無 ARM64 時自動 fallback 到 native 模式
 * 3. Native 模式：直接用 uv run python run.py 背景啟動
 */
const { execSync, execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CONTAINER_NAME = 'mirofish';
const IMAGE = 'ghcr.io/666ghj/mirofish:latest';
const PORT = 5001;
const HEALTH_URL = `http://localhost:${PORT}/health`;
const ENV_DIR = path.join(require('os').homedir(), '.mirofish');
const ENV_FILE = path.join(ENV_DIR, '.env');
const PID_FILE = path.join(ENV_DIR, 'backend.pid');
const CONFIG_FILE = path.join(ENV_DIR, 'config.json');

// Known MiroFish install locations (native mode)
const MIROFISH_DIRS = [
    path.join(process.cwd(), 'MiroFish'),
    path.join(require('os').homedir(), 'MiroFish'),
];

// --- Low-level helpers ---

function dockerAvailable() {
    try {
        execSync('docker info', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function containerStatus() {
    try {
        return execSync(
            `docker inspect --format='{{.State.Status}}' ${CONTAINER_NAME} 2>/dev/null`,
            { encoding: 'utf-8' }
        ).trim();
    } catch {
        return null;
    }
}

function healthCheck(timeoutMs = 3000) {
    return new Promise((resolve) => {
        const req = http.get(HEALTH_URL, { timeout: timeoutMs }, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.status === 'ok');
                } catch {
                    resolve(false);
                }
            });
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
    });
}

function nativePidAlive() {
    if (!fs.existsSync(PID_FILE)) return false;
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
    try {
        process.kill(pid, 0);
        return pid;
    } catch {
        fs.unlinkSync(PID_FILE);
        return false;
    }
}

function findMirofishDir() {
    // Env override
    if (process.env.MIROFISH_DIR) {
        const d = process.env.MIROFISH_DIR;
        if (fs.existsSync(path.join(d, 'backend', 'run.py'))) return d;
    }
    // Saved config from previous run
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
            if (cfg.mirofish_dir && fs.existsSync(path.join(cfg.mirofish_dir, 'backend', 'run.py'))) {
                return cfg.mirofish_dir;
            }
        } catch { }
    }
    // Scan known locations
    for (const d of MIROFISH_DIRS) {
        if (fs.existsSync(path.join(d, 'backend', 'run.py'))) return d;
    }
    return null;
}

function ensureEnvFile() {
    if (fs.existsSync(ENV_FILE)) return ENV_FILE;

    const localEnv = path.join(process.cwd(), '.env');
    if (fs.existsSync(localEnv)) return localEnv;

    // Create template
    fs.mkdirSync(ENV_DIR, { recursive: true });
    fs.writeFileSync(ENV_FILE, [
        '# MiroFish LLM 配置',
        '# 支援任何 OpenAI SDK 格式端點',
        'LLM_API_KEY=your_api_key_here',
        'LLM_BASE_URL=http://host.docker.internal:1234/v1',
        'LLM_MODEL_NAME=your_model_name',
        '',
        '# ZEP 記憶圖譜（免費: https://app.getzep.com/）',
        'ZEP_API_KEY=your_zep_key_here',
    ].join('\n'));
    return null;
}

function parseEnvFile(envFile) {
    const envContent = fs.readFileSync(envFile, 'utf-8');
    const vars = { ...process.env };
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
            vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
        }
    }
    return vars;
}

async function waitForHealth(mode) {
    console.log('⏳ Waiting for backend to be ready...');
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        if (await healthCheck()) {
            console.log(`✅ MiroFish is ready! (${mode} mode, http://localhost:${PORT})`);
            return true;
        }
        process.stdout.write('.');
    }
    console.log(`\n⚠️  Backend started but health check not passing yet.`);
    return false;
}

// --- Docker mode ---

async function startDocker(envFile) {
    // Remove stopped container
    const status = containerStatus();
    if (status && status !== 'running') {
        execFileSync('docker', ['rm', CONTAINER_NAME], { stdio: 'ignore' });
    }

    // Pull image
    let imageOk = false;
    try {
        execFileSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' });
        imageOk = true;
    } catch {
        console.log('📦 Pulling MiroFish Docker image...');
        try {
            execFileSync('docker', ['pull', IMAGE], { stdio: 'inherit' });
            imageOk = true;
        } catch {
            // Image pull failed (no ARM64 manifest, network, etc.)
        }
    }

    if (!imageOk) return false;

    console.log('🚀 Starting MiroFish backend (Docker)...');
    execFileSync('docker', [
        'run', '-d',
        '--name', CONTAINER_NAME,
        '-p', `${PORT}:${PORT}`,
        '--env-file', envFile,
        '--add-host', 'host.docker.internal:host-gateway',
        '--restart', 'unless-stopped',
        IMAGE,
        'sh', '-c', 'cd backend && uv run python run.py',
    ], { stdio: 'inherit' });

    await waitForHealth('Docker');
    return true;
}

// --- Native mode ---

async function startNative(envFile) {
    const mirofishDir = findMirofishDir();
    if (!mirofishDir) {
        console.error('❌ MiroFish not found locally. Please clone it:');
        console.error('   git clone https://github.com/666ghj/MiroFish.git');
        console.error('   cd MiroFish && npm run setup:all');
        process.exit(1);
    }

    try {
        execSync('uv --version', { stdio: 'ignore' });
    } catch {
        console.error('❌ uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh');
        process.exit(1);
    }

    const backendDir = path.join(mirofishDir, 'backend');
    const envVars = parseEnvFile(envFile);

    // For native mode, LLM_BASE_URL should use actual IP, not host.docker.internal
    if (envVars.LLM_BASE_URL && envVars.LLM_BASE_URL.includes('host.docker.internal')) {
        envVars.LLM_BASE_URL = envVars.LLM_BASE_URL.replace('host.docker.internal', 'localhost');
    }

    console.log(`🚀 Starting MiroFish backend (native) from ${backendDir}...`);
    const child = spawn('uv', ['run', 'python', 'run.py'], {
        cwd: backendDir,
        env: envVars,
        stdio: 'ignore',
        detached: true,
    });
    child.unref();

    fs.mkdirSync(ENV_DIR, { recursive: true });
    fs.writeFileSync(PID_FILE, String(child.pid));
    // Save mirofish dir for future commands
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ mirofish_dir: mirofishDir }, null, 2));

    await waitForHealth('Native');
    return true;
}

// --- Public API ---

async function start() {
    // Already running?
    if (containerStatus() === 'running' || nativePidAlive()) {
        const healthy = await healthCheck();
        console.log(healthy
            ? '✅ MiroFish is already running and healthy.'
            : '⚠️  Backend running but health check failed.');
        return;
    }

    // Ensure env
    const envFile = ensureEnvFile();
    if (!envFile) {
        console.log(`📝 Created config template: ${ENV_FILE}`);
        console.log(`   Edit with your API keys, then run 'mirofish serve start' again.`);
        process.exit(1);
    }
    const envContent = fs.readFileSync(envFile, 'utf-8');
    if (envContent.includes('your_api_key_here')) {
        console.error(`❌ Please configure API keys in: ${envFile}`);
        process.exit(1);
    }

    // Try Docker first, fallback to native
    if (dockerAvailable()) {
        const ok = await startDocker(envFile);
        if (ok) return;
        console.log('⚠️  Docker image unavailable (no ARM64 build). Trying native mode...');
    } else {
        console.log('ℹ️  Docker not available. Using native mode.');
    }

    await startNative(envFile);
}

async function stop() {
    let stopped = false;

    // Docker
    const status = containerStatus();
    if (status) {
        console.log('🛑 Stopping Docker container...');
        try { execFileSync('docker', ['stop', CONTAINER_NAME], { stdio: 'ignore' }); } catch { }
        try { execFileSync('docker', ['rm', CONTAINER_NAME], { stdio: 'ignore' }); } catch { }
        console.log('✅ Docker container stopped.');
        stopped = true;
    }

    // Native
    const pid = nativePidAlive();
    if (pid) {
        console.log(`🛑 Stopping native backend (PID ${pid})...`);
        try { process.kill(pid, 'SIGTERM'); } catch { }
        if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
        console.log('✅ Native backend stopped.');
        stopped = true;
    }

    if (!stopped) {
        console.log('ℹ️  MiroFish is not running.');
    }
}

async function showStatus() {
    // Docker check
    if (dockerAvailable()) {
        const status = containerStatus();
        if (status === 'running') {
            const healthy = await healthCheck();
            console.log(healthy
                ? '✅ MiroFish is running (Docker, http://localhost:5001)'
                : '⚠️  Docker container running but health check failed. Run: docker logs mirofish');
            return;
        }
        if (status) {
            console.log(`⚠️  Docker container exists but status: ${status}`);
            return;
        }
    }

    // Native check
    const pid = nativePidAlive();
    if (pid) {
        const healthy = await healthCheck();
        console.log(healthy
            ? `✅ MiroFish is running (native, PID ${pid}, http://localhost:5001)`
            : `⚠️  Native backend running (PID ${pid}) but health check failed.`);
        return;
    }

    console.log('⭕ MiroFish is not running.');
    console.log('   Start with: mirofish serve start');
}

async function ensureRunning() {
    // Docker running?
    if (containerStatus() === 'running' && await healthCheck()) return;
    // Native running?
    if (nativePidAlive() && await healthCheck()) return;

    // Wait if something is running but not healthy yet
    if (containerStatus() === 'running' || nativePidAlive()) {
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 2000));
            if (await healthCheck()) return;
        }
        throw new Error('MiroFish running but not healthy. Check logs.');
    }

    // Not running — auto-start
    console.log('🔄 MiroFish not running. Starting automatically...');
    await start();
}

module.exports = { start, stop, showStatus, ensureRunning, healthCheck };
