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
const { notifyPredictionComplete } = require('./notify.js');
const { JsonStreamEmitter } = require('./json-stream.js');

const POLL_INTERVAL = 15000; // 15s
const MAX_POLL_MINUTES = 60;

async function predict(seedText, opts = {}) {
    const rounds = opts.rounds || 20;
    const distributed = opts.distributed || false;
    const workers = opts.workers || 2;
    const mode = opts.mode || 'docker';
    const jsonStream = opts.jsonStream ? wrapWithJsonStream() : null;
    let currentStep = 0;

    // In json-stream mode, redirect human-readable output to stderr
    // so stdout is pure NDJSON for the RunManager to parse.
    const _origLog = console.log;
    const _origWrite = process.stdout.write.bind(process.stdout);
    if (jsonStream) {
        console.log = (...args) => process.stderr.write(args.join(' ') + '\n');
        process.stdout.write = (chunk, ...rest) => {
            if (typeof chunk === 'string' && !chunk.startsWith('{')) {
                return process.stderr.write(chunk, ...rest);
            }
            return _origWrite(chunk, ...rest);
        };
    }

    if (jsonStream) jsonStream.runStart({ topic: seedText });

  try {
    // Step 0: Ensure backend
    await ensureRunning();

    // Expand short seed text into a richer document for better graph extraction
    let documentText = seedText;
    if (seedText.length < 200) {
        documentText = [
            `# Simulation Scenario: ${seedText}`,
            '',
            `## Background`,
            `${seedText}. This is a significant event that will affect many stakeholders in the market.`,
            '',
            `## Key Stakeholders`,
            `- Retail traders and investors who hold positions`,
            `- Professional financial analysts and researchers`,
            `- Cryptocurrency exchange platforms (Binance, Coinbase, etc.)`,
            `- Institutional investors and hedge funds`,
            `- Media commentators and KOL influencers on social media`,
            `- Government regulators and policy makers`,
            `- Mining companies and blockchain infrastructure providers`,
            `- DeFi protocol developers and users`,
            '',
            `## Expected Dynamics`,
            `When ${seedText}, various stakeholders will react differently based on their positions, ` +
            `risk tolerance, and market views. Traders may take profits or increase leverage. ` +
            `Analysts will publish forecasts. KOLs will share opinions on Twitter and Reddit. ` +
            `Regulators may issue new guidance. Exchanges will see increased volume.`,
            '',
            `## Discussion Topics`,
            `- Price predictions and technical analysis`,
            `- Market sentiment and fear/greed index`,
            `- Impact on altcoins and DeFi ecosystem`,
            `- Regulatory responses from major economies`,
            `- Institutional adoption and ETF flows`,
        ].join('\n');
        console.log(`   ℹ️  Expanded seed text (${seedText.length} → ${documentText.length} chars)`);
    }

    // Step 1: Create project (ontology generation)
    currentStep = 1;
    if (jsonStream) jsonStream.stepStart(1);
    console.log('\n📋 Step 1/7: Creating project & generating ontology...');
    const tmpFile = path.join(os.tmpdir(), `mirofish_seed_${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, documentText);
    const project = await formDataUpload('/api/graph/ontology/generate', {
        simulation_requirement: seedText,
        project_name: seedText.slice(0, 50),
    }, tmpFile, 'files');
    fs.unlinkSync(tmpFile);

    const projectData = project.data || project;
    const projectId = projectData.project_id || projectData.id;
    if (!projectId) {
        console.error('❌ Failed to create project:', JSON.stringify(project, null, 2));
        throw new Error(`Failed to create project: ${JSON.stringify(project, null, 2)}`);
    }
    console.log(`   Project ID: ${projectId}`);
    if (jsonStream) jsonStream.stepDone(1, { projectId });

    // Step 2: Build knowledge graph (async — returns task_id)
    currentStep = 2;
    if (jsonStream) jsonStream.stepStart(2);
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
                    throw new Error(`Graph build failed: ${JSON.stringify(taskData)}`);
                }
            } catch {
                process.stdout.write('.');
            }
        }
    } else {
        console.log('   ✅ Knowledge graph built.');
    }
    if (jsonStream) jsonStream.stepDone(2, { graphBuilt: true });

    // Step 3: Create simulation
    currentStep = 3;
    if (jsonStream) jsonStream.stepStart(3);
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
        throw new Error(`Failed to create simulation: ${JSON.stringify(createRes, null, 2)}`);
    }
    console.log(`   Simulation ID: ${simId}`);
    if (jsonStream) jsonStream.stepDone(3, { simId });

    // Step 4: Prepare simulation (generate agent personas)
    currentStep = 4;
    if (jsonStream) jsonStream.stepStart(4);
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
                    throw new Error(`Preparation failed: ${JSON.stringify(ps)}`);
                }
            } catch {
                process.stdout.write('.');
            }
        }
    } else {
        console.log('   ✅ Agent personas ready!');
    }
    if (jsonStream) jsonStream.stepDone(4, { prepared: true });

    // Step 5: Start simulation
    currentStep = 5;
    if (jsonStream) jsonStream.stepStart(5);
    if (distributed) {
        if (mode === 'native') {
            const peerConfig = require('./peer-config.js');
            const coordPeer = peerConfig.getCoordinatorPeer();
            const coordinatorAddr = coordPeer ? coordPeer.grpc_addr : 'localhost:50051';
            const clusterToken = coordPeer ? coordPeer.cluster_token || '' : '';
            console.log(`\n🚀 Step 5/7: Starting NATIVE distributed simulation...`);
            console.log(`   Coordinator: ${coordinatorAddr}`);
            await request('POST', '/api/simulation/distributed/start-native', {
                simulation_id: simId,
                coordinator_addr: coordinatorAddr,
                cluster_token: clusterToken,
                max_rounds: rounds,
            });
            console.log('   Native worker started, connecting to remote coordinator.');
        } else {
            console.log(`\n🚀 Step 5/7: Starting DISTRIBUTED simulation (${rounds} rounds, ${workers} workers)...`);
            await request('POST', '/api/simulation/distributed/start', {
                simulation_id: simId,
                num_workers: workers,
                max_rounds: rounds,
            });
            console.log('   Distributed cluster started. This may take 15-60 minutes.');
        }
    } else {
        console.log(`\n🚀 Step 5/7: Starting simulation (${rounds} rounds)...`);
        await request('POST', '/api/simulation/start', {
            simulation_id: simId,
            max_rounds: rounds,
        });
        console.log('   Simulation started. This may take 10-30 minutes.');
    }
    if (jsonStream) jsonStream.stepDone(5, { started: true, rounds, distributed });

    // Step 6: Poll status
    currentStep = 6;
    if (jsonStream) jsonStream.stepStart(6);
    console.log('\n⏳ Step 6/7: Waiting for completion...');
    const maxPolls = (MAX_POLL_MINUTES * 60 * 1000) / POLL_INTERVAL;
    for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        try {
            let statusRes, statusData, runnerStatus, progress;
            if (distributed) {
                statusRes = await request('POST', '/api/simulation/distributed/status', {
                    simulation_id: simId,
                });
                statusData = statusRes.data || statusRes;
                runnerStatus = statusData.runner_status || statusData.status;
                progress = statusData.progress_percent || '';
            } else {
                statusRes = await request('GET', `/api/simulation/${simId}/run-status`);
                statusData = statusRes.data || statusRes;
                runnerStatus = statusData.runner_status || statusData.status;
                progress = statusData.progress || '';
            }
            process.stdout.write(`\r   Status: ${runnerStatus} ${progress}%    `);
            if (jsonStream) jsonStream.stepProgress(6, parseFloat(progress) / 100 || 0, runnerStatus);

            if (runnerStatus === 'completed' || runnerStatus === 'finished') {
                console.log('\n   ✅ Simulation completed!');
                break;
            }
            if (runnerStatus === 'failed' || runnerStatus === 'error') {
                console.error(`\n   ❌ Simulation failed: ${JSON.stringify(statusData)}`);
                throw new Error(`Simulation failed: ${JSON.stringify(statusData)}`);
            }
        } catch {
            process.stdout.write('.');
        }
    }
    if (jsonStream) jsonStream.stepDone(6, { completed: true });

    // Step 7: Generate & retrieve report
    currentStep = 7;
    if (jsonStream) jsonStream.stepStart(7);
    console.log('\n📊 Step 7/7: Generating report...');
    await request('POST', '/api/report/generate', { simulation_id: simId });

    // Wait for report generation with polling
    let reportReady = false;
    const maxReportWait = 10 * 60 * 1000; // 10 minutes max
    const reportPollInterval = 5000; // 5s
    const reportStart = Date.now();

    while (!reportReady && Date.now() - reportStart < maxReportWait) {
        await new Promise(r => setTimeout(r, reportPollInterval));
        try {
            const check = await request('GET', `/api/report/check/${simId}`);
            const checkData = check.data || check;
            if (checkData.report_status === 'completed') {
                reportReady = true;
            } else if (checkData.report_status === 'failed') {
                console.error('   ❌ Report generation failed');
                break;
            } else {
                const elapsed = Math.round((Date.now() - reportStart) / 1000);
                process.stdout.write(`\r   ⏳ Generating report... ${elapsed}s`);
            }
        } catch {
            // API not available yet, keep waiting
        }
    }
    if (!reportReady) {
        console.log('\n   ⚠️  Report may still be generating. Attempting to fetch...');
    } else {
        console.log('\r   ✅ Report generated!                    ');
    }

    const report = await request('GET', `/api/report/by-simulation/${simId}`);
    const reportData = report.data || report;
    if (jsonStream) jsonStream.stepDone(7, { reportId: reportData.id || reportData.report_id });

    // Format and display report
    const formatted = formatReport(reportData, seedText);
    console.log(formatted);

    // Save report to file
    const reportFile = path.join(os.tmpdir(), `mirofish_report_${simId}.md`);
    fs.writeFileSync(reportFile, formatted);
    console.log(`\n💾 Report saved to: ${reportFile}`);

    // Notification
    const sectionCount = reportData.outline?.sections?.length || 0;
    const reportId = reportData.id || reportData.report_id || '';
    // Extract first ~500 chars as summary for notification
    const rawContent = reportData.markdown_content || formatted;
    const summaryLines = rawContent.split('\n').slice(0, 15).join('\n');
    const reportSummary = summaryLines.length > 500 ? summaryLines.slice(0, 500) + '…' : summaryLines;
    await notifyPredictionComplete({
        topic: seedText,
        simId,
        sections: sectionCount,
        canvasPort: opts.canvas ? (opts.canvasPort || 18790) : null,
        reportId,
        reportSummary,
    });

    console.log(`\nSimulation ID: ${simId}`);
    console.log('Next steps:');
    console.log(`  mirofish canvas ${simId}       # 🖥️  Open visual Dashboard`);
    console.log(`  mirofish chat ${simId} "問題"   # 💬 Ask Report Agent`);
    console.log(`  mirofish interview ${simId} 0 "問題"  # 🎤 Interview Agent`);

    // Auto-open canvas if --canvas flag
    if (opts.canvas) {
        console.log('\n🖥️  Opening Canvas Dashboard...');
        const { launchCanvas } = require('./canvas.js');
        await launchCanvas(simId, { port: opts.canvasPort || 18790 });
    }

    if (jsonStream) jsonStream.runDone({ reportId: reportData.id || reportData.report_id || simId, simId });
    return { projectId, simId, report: reportData };
  } catch (err) {
    if (jsonStream) jsonStream.runError(currentStep, err.code || 'error', err.message);
    throw err;
  } finally {
    // Restore stdout in json-stream mode
    if (jsonStream) {
        console.log = _origLog;
        process.stdout.write = _origWrite;
    }
  }
}

/**
 * Format report data into readable Markdown output
 */
function formatReport(reportData, topic) {
    const lines = [];
    const outline = reportData.outline;
    const markdown = reportData.markdown_content;

    lines.push('\n' + '═'.repeat(60));
    lines.push('📊 MIROFISH PREDICTION REPORT');
    lines.push('═'.repeat(60));

    if (outline) {
        lines.push('');
        lines.push(`📌 ${outline.title || topic}`);
        if (outline.summary) {
            lines.push('');
            lines.push(`   ${outline.summary}`);
        }
        lines.push('');
        lines.push('─'.repeat(60));

        // Section list
        if (outline.sections && outline.sections.length > 0) {
            lines.push('');
            lines.push('📑 Sections:');
            outline.sections.forEach((s, i) => {
                lines.push(`   ${String(i + 1).padStart(2, '0')}. ${s.title}`);
            });
        }
    }

    // Full markdown content
    if (markdown) {
        lines.push('');
        lines.push('─'.repeat(60));
        lines.push('');
        // Truncate if very long for terminal display
        const maxLen = 3000;
        if (markdown.length > maxLen) {
            lines.push(markdown.slice(0, maxLen));
            lines.push(`\n... (truncated, ${markdown.length} chars total)`);
            lines.push(`Full report saved to file.`);
        } else {
            lines.push(markdown);
        }
    }

    lines.push('');
    lines.push('═'.repeat(60));

    return lines.join('\n');
}

function wrapWithJsonStream(fn) {
    return new JsonStreamEmitter(fn || ((line) => process.stdout.write(line + '\n')));
}

module.exports = { predict, formatReport, wrapWithJsonStream };
