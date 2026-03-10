#!/usr/bin/env node
/**
 * 高階推演流程 — 一行完成所有事
 * create → build → prepare → simulate → poll → report
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { request, formDataUpload } = require('./api.js');
const { ensureRunning } = require('./docker.js');

const POLL_INTERVAL = 15000; // 15s
const MAX_POLL_MINUTES = 60;

async function predict(seedText, opts = {}) {
    const rounds = opts.rounds || 20;
    const platform = opts.platform || 'parallel';

    // Step 0: Ensure backend
    await ensureRunning();

    // Step 1: Create project
    console.log('\n📋 Step 1/6: Creating project...');
    const tmpFile = path.join(os.tmpdir(), `mirofish_seed_${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, seedText);
    const project = await formDataUpload('/api/graph/ontology/generate', {
        simulation_requirement: seedText,
    }, tmpFile);
    fs.unlinkSync(tmpFile);

    const projectId = project.project_id || project.id;
    if (!projectId) {
        console.error('❌ Failed to create project:', JSON.stringify(project, null, 2));
        process.exit(1);
    }
    console.log(`   Project ID: ${projectId}`);

    // Step 2: Build graph
    console.log('\n🕸️  Step 2/6: Building knowledge graph...');
    await request('POST', '/api/graph/build', { project_id: projectId });
    console.log('   Knowledge graph built.');

    // Step 3: Prepare simulation
    console.log('\n🤖 Step 3/6: Preparing simulation (generating agent personas)...');
    const simData = await request('POST', '/api/simulation/prepare', { project_id: projectId });
    const simId = simData.simulation_id || simData.id;
    if (!simId) {
        console.error('❌ Failed to prepare simulation:', JSON.stringify(simData, null, 2));
        process.exit(1);
    }
    console.log(`   Simulation ID: ${simId}`);

    // Step 4: Start simulation
    console.log(`\n🚀 Step 4/6: Starting simulation (${rounds} rounds, ${platform} platform)...`);
    await request('POST', '/api/simulation/start', {
        simulation_id: simId,
        platform,
        max_rounds: rounds,
    });
    console.log('   Simulation started. This may take 10-30 minutes.');

    // Step 5: Poll status
    console.log('\n⏳ Step 5/6: Waiting for completion...');
    const maxPolls = (MAX_POLL_MINUTES * 60 * 1000) / POLL_INTERVAL;
    for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        try {
            const status = await request('GET', `/api/simulation/${simId}/run-status`);
            const runnerStatus = status.runner_status || status.status;
            const progress = status.progress || '';
            process.stdout.write(`\r   Status: ${runnerStatus} ${progress}    `);

            if (runnerStatus === 'completed' || runnerStatus === 'finished') {
                console.log('\n   ✅ Simulation completed!');
                break;
            }
            if (runnerStatus === 'failed' || runnerStatus === 'error') {
                console.error(`\n   ❌ Simulation failed: ${JSON.stringify(status)}`);
                process.exit(1);
            }
        } catch (e) {
            // Transient error, keep polling
            process.stdout.write('.');
        }
    }

    // Step 6: Generate & retrieve report
    console.log('\n📊 Step 6/6: Generating report...');
    await request('POST', '/api/report/generate', { simulation_id: simId });

    // Wait a bit for report generation
    await new Promise(r => setTimeout(r, 5000));

    const report = await request('GET', `/api/report/by-simulation/${simId}`);
    console.log('\n' + '='.repeat(60));
    console.log('📊 SIMULATION REPORT');
    console.log('='.repeat(60));
    console.log(JSON.stringify(report, null, 2));
    console.log('='.repeat(60));
    console.log(`\nSimulation ID: ${simId}`);
    console.log('Follow-up: mirofish chat ' + simId + ' "your question"');
    console.log('Interview: mirofish interview ' + simId + ' 0 "your question"');

    return { projectId, simId, report };
}

module.exports = { predict };
