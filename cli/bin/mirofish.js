#!/usr/bin/env node
/**
 * MiroFish CLI — 群體智能推演引擎
 *
 * Usage:
 *   mirofish serve start|stop|status
 *   mirofish predict "推演主題"
 *   mirofish projects
 *   mirofish status <simulation_id>
 *   mirofish report <simulation_id>
 *   mirofish chat <simulation_id> "問題"
 *   mirofish interview <simulation_id> <agent_id> "問題"
 */
const { request } = require('../lib/api.js');
const docker = require('../lib/docker.js');
const { predict } = require('../lib/predict.js');

const args = process.argv.slice(2);
const cmd = args[0];
const sub = args[1];

function usage() {
    console.log(`
🐟 MiroFish CLI — 群體智能推演引擎

Usage:
  mirofish serve start              Start MiroFish backend (Docker)
  mirofish serve stop               Stop MiroFish backend
  mirofish serve status             Check backend status

  mirofish predict "topic"          Full prediction pipeline (auto-starts backend)
    --rounds=20                     Number of simulation rounds (default: 20)
    --platform=parallel             Platform: twitter|reddit|parallel (default: parallel)

  mirofish projects                 List all projects
  mirofish status <sim_id>          Check simulation status
  mirofish report <sim_id>          Get simulation report
  mirofish chat <sim_id> "question" Chat with Report Agent
  mirofish interview <sim_id> <agent_id> "question"
                                    Interview a specific agent

  mirofish env                      Show current configuration

Environment:
  MIROFISH_URL    Backend URL (default: http://localhost:5001)
  LLM_API_KEY     LLM API key (passed to MiroFish via Docker)
  LLM_BASE_URL    LLM endpoint (default: http://host.docker.internal:1234/v1)
  LLM_MODEL_NAME  LLM model name
  ZEP_API_KEY     ZEP memory graph API key
`);
}

function parseFlags(argv) {
    const flags = {};
    for (const a of argv) {
        const m = a.match(/^--(\w+)=(.+)$/);
        if (m) flags[m[1]] = m[2];
    }
    return flags;
}

async function main() {
    try {
        switch (cmd) {
            case 'serve':
            case 'daemon': {
                switch (sub) {
                    case 'start': return await docker.start();
                    case 'stop': return await docker.stop();
                    case 'status': return await docker.showStatus();
                    default:
                        console.error('Usage: mirofish serve start|stop|status');
                        process.exit(1);
                }
            }

            case 'predict': {
                const topic = sub;
                if (!topic) {
                    console.error('Usage: mirofish predict "推演主題"');
                    process.exit(1);
                }
                const flags = parseFlags(args.slice(2));
                return await predict(topic, {
                    rounds: flags.rounds ? parseInt(flags.rounds) : 20,
                    platform: flags.platform || 'parallel',
                });
            }

            case 'projects': {
                await docker.ensureRunning();
                const res = await request('GET', '/api/graph/project/list');
                console.log(JSON.stringify(res, null, 2));
                return;
            }

            case 'status': {
                if (!sub) { console.error('Usage: mirofish status <simulation_id>'); process.exit(1); }
                await docker.ensureRunning();
                const res = await request('GET', `/api/simulation/${sub}/run-status`);
                console.log(JSON.stringify(res, null, 2));
                return;
            }

            case 'report': {
                if (!sub) { console.error('Usage: mirofish report <simulation_id>'); process.exit(1); }
                await docker.ensureRunning();
                const res = await request('GET', `/api/report/by-simulation/${sub}`);
                console.log(JSON.stringify(res, null, 2));
                return;
            }

            case 'chat': {
                const simId = sub;
                const question = args[2];
                if (!simId || !question) {
                    console.error('Usage: mirofish chat <simulation_id> "問題"');
                    process.exit(1);
                }
                await docker.ensureRunning();
                const res = await request('POST', '/api/report/chat', {
                    simulation_id: simId,
                    message: question,
                });
                console.log(JSON.stringify(res, null, 2));
                return;
            }

            case 'interview': {
                const simId = sub;
                const agentId = args[2];
                const question = args[3];
                if (!simId || agentId === undefined || !question) {
                    console.error('Usage: mirofish interview <simulation_id> <agent_id> "問題"');
                    process.exit(1);
                }
                await docker.ensureRunning();
                const res = await request('POST', '/api/simulation/interview', {
                    simulation_id: simId,
                    agent_id: parseInt(agentId),
                    prompt: question,
                });
                console.log(JSON.stringify(res, null, 2));
                return;
            }

            case 'env': {
                console.log('Configuration:');
                console.log(`  MIROFISH_URL:    ${process.env.MIROFISH_URL || 'http://localhost:5001 (default)'}`);
                console.log(`  LLM_API_KEY:     ${process.env.LLM_API_KEY ? '***' + process.env.LLM_API_KEY.slice(-4) : '(not set)'}`);
                console.log(`  LLM_BASE_URL:    ${process.env.LLM_BASE_URL || '(not set)'}`);
                console.log(`  LLM_MODEL_NAME:  ${process.env.LLM_MODEL_NAME || '(not set)'}`);
                console.log(`  ZEP_API_KEY:     ${process.env.ZEP_API_KEY ? '***' + process.env.ZEP_API_KEY.slice(-4) : '(not set)'}`);
                return;
            }

            case '--help':
            case '-h':
            case 'help':
            case undefined:
                return usage();

            default:
                console.error(`Unknown command: ${cmd}`);
                usage();
                process.exit(1);
        }
    } catch (e) {
        console.error(`\n❌ Error: ${e.message}`);
        process.exit(1);
    }
}

main();
