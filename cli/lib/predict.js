#!/usr/bin/env node
/**
 * 高階推演流程 — 一行完成所有事
 * ontology → build → create_sim → prepare → start → poll → report
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

    // Step 0: Ensure backend
    await ensureRunning();

    // Step 1: Create project (ontology generation)
    console.log('\n📋 Step 1/7: Creating project & generating ontology...');
    const tmpFile = path.join(os.tmpdir(), `mirofish_seed_${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, seedText);
    const project = await formDataUpload('/api/graph/ontology/generate', {
        simulation_requirement: seedText,
        project_name: seedText.slice(0, 50),
    }, tmpFile, 'files');
    fs.unlinkSync(tmpFile);

    const projectData = project.data || project;
    const projectId = projectData.project_id || projectData.id;
    if (!projectId) {
        console.error('❌ Failed to create project:', JSON.stringify(project, null, 2));
        process.exit(1);
    }
    console.log(`   Project ID: ${projectId}`);

    // Step 2: Build knowledge graph (async — returns task_id)
    console.log('\n🕸️  Step 2/7: Building knowledge graph...');
    const buildRes = await request('POST', '/api/graph/build', { project_id: projectId });
    const buildData = buildRes.data || buildRes;
    const buildTaskId = buildData.task_id;

    if (buildTaskId) {
        console.log(`   Build task started: ${buildTaskId}`);
        for (let i = 0; i < 120; i++) { // max ~30min
            await new Promise(r => setTimeout(r, 15000));
            try {
                const taskRes = await request('GET', `/api/graph/task/${buildTaskId}`);
                const taskData = taskRes.data || taskRes;
                const taskStatus = taskData.status;
                const progress = taskData.progress || '';
                process.stdout.write(`\r   Graph build: ${taskStatus} ${progress}%     `);

                if (taskStatus === 'completed' || taskStatus === 'success') {
                    console.log('\n   ✅ Knowledge graph built!');
                    break;
                }
                if (taskStatus === 'failed' || taskStatus === 'error') {
                    console.error(`\n   ❌ Graph build failed: ${JSON.stringify(taskData)}`);
                    process.exit(1);
                }
            } catch {
                process.stdout.write('.');
            }
        }
    } else {
        console.log('   ✅ Knowledge graph built.');
    }

    // Step 3: Create simulation
    console.log('\n🎯 Step 3/7: Creating simulation...');
    const createRes = await request('POST', '/api/simulation/create', {
        project_id: projectId,
        enable_twitter: true,
        enable_reddit: true,
    });
    const createData = createRes.data || createRes;
    const simId = createData.simulation_id || createData.id;
    if (!simId) {
        console.error('❌ Failed to create simulation:', JSON.stringify(createRes, null, 2));
        process.exit(1);
    }
    console.log(`   Simulation ID: ${simId}`);

    // Step 4: Prepare simulation (generate agent personas)
    console.log('\n🤖 Step 4/7: Preparing simulation (generating agent personas)...');
    console.log('   This may take several minutes...');
    const prepRes = await request('POST', '/api/simulation/prepare', {
        simulation_id: simId,
    });
    const prepData = prepRes.data || prepRes;
    const prepStatus = prepData.status;

    // If prepare is async (returns task_id), poll prepare/status
    if (prepData.task_id && prepStatus !== 'ready') {
        console.log(`   Preparation task started: ${prepData.task_id}`);
        for (let i = 0; i < 120; i++) { // max ~30min
            await new Promise(r => setTimeout(r, 15000));
            try {
                const pStatus = await request('POST', '/api/simulation/prepare/status', {
                    task_id: prepData.task_id,
                    simulation_id: simId,
                });
                const ps = pStatus.data || pStatus;
                process.stdout.write(`\r   Prepare: ${ps.status || 'working'} ${ps.progress || ''}     `);
                if (ps.status === 'ready' || ps.status === 'completed') {
                    console.log('\n   ✅ Agent personas ready!');
                    break;
                }
                if (ps.status === 'failed' || ps.status === 'error') {
                    console.error(`\n   ❌ Preparation failed: ${JSON.stringify(ps)}`);
                    process.exit(1);
                }
            } catch {
                process.stdout.write('.');
            }
        }
    } else {
        console.log('   ✅ Agent personas ready!');
    }

    // Step 5: Start simulation
    console.log(`\n🚀 Step 5/7: Starting simulation (${rounds} rounds)...`);
    await request('POST', '/api/simulation/start', {
        simulation_id: simId,
        max_rounds: rounds,
    });
    console.log('   Simulation started. This may take 10-30 minutes.');

    // Step 6: Poll status
    console.log('\n⏳ Step 6/7: Waiting for completion...');
    const maxPolls = (MAX_POLL_MINUTES * 60 * 1000) / POLL_INTERVAL;
    for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        try {
            const statusRes = await request('GET', `/api/simulation/${simId}/run-status`);
            const statusData = statusRes.data || statusRes;
            const runnerStatus = statusData.runner_status || statusData.status;
            const progress = statusData.progress || '';
            process.stdout.write(`\r   Status: ${runnerStatus} ${progress}    `);

            if (runnerStatus === 'completed' || runnerStatus === 'finished') {
                console.log('\n   ✅ Simulation completed!');
                break;
            }
            if (runnerStatus === 'failed' || runnerStatus === 'error') {
                console.error(`\n   ❌ Simulation failed: ${JSON.stringify(statusData)}`);
                process.exit(1);
            }
        } catch {
            process.stdout.write('.');
        }
    }

    // Step 7: Generate & retrieve report
    console.log('\n📊 Step 7/7: Generating report...');
    await request('POST', '/api/report/generate', { simulation_id: simId });

    // Wait for report generation
    await new Promise(r => setTimeout(r, 5000));

    const report = await request('GET', `/api/report/by-simulation/${simId}`);
    const reportData = report.data || report;
    console.log('\n' + '='.repeat(60));
    console.log('📊 SIMULATION REPORT');
    console.log('='.repeat(60));
    console.log(JSON.stringify(reportData, null, 2));
    console.log('='.repeat(60));
    console.log(`\nSimulation ID: ${simId}`);
    console.log('Follow-up: mirofish chat ' + simId + ' "your question"');
    console.log('Interview: mirofish interview ' + simId + ' 0 "your question"');

    return { projectId, simId, report: reportData };
}

module.exports = { predict };
