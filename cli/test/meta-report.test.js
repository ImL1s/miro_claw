/**
 * meta-report.js 單元測試（TDD — 先寫測試）
 *
 * 測試多節點推演結果的合併分析邏輯
 */
const assert = require('assert');

// 先試 require，預期會失敗（RED phase）
let metaReport;
try {
    metaReport = require('../lib/meta-report.js');
} catch (e) {
    console.error('❌ Cannot load meta-report.js — need to implement it first');
    process.exit(1);
}

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ ${name}: ${e.message}`);
        failed++;
    }
}

// --- 模擬資料 ---
const REPORT_A = {
    node: 'node-a',
    simulation_id: 'sim_001',
    topic: '如果比特幣突破15萬',
    report: {
        outline: {
            title: 'Bitcoin 150k Analysis',
            sections: [
                { title: 'Market Impact', content: 'BTC surge causes altcoin rally. ETH follows to $8000.' },
                { title: 'Regulation', content: 'SEC may increase scrutiny. Spot ETF inflows accelerate.' },
            ]
        },
        status: 'completed',
    }
};

const REPORT_B = {
    node: 'node-b',
    simulation_id: 'sim_002',
    topic: '如果比特幣突破15萬',
    report: {
        outline: {
            title: 'BTC $150K Scenario',
            sections: [
                { title: 'Macro Effects', content: 'Dollar weakens. Gold correlation breaks. Institutional FOMO.' },
                { title: 'Retail Sentiment', content: 'Extreme greed index. New retail investors flood in.' },
            ]
        },
        status: 'completed',
    }
};

const REPORT_C = {
    node: 'node-c',
    simulation_id: 'sim_003',
    topic: '如果比特幣突破15萬',
    report: {
        outline: {
            title: 'BTC 150K Impact',
            sections: [
                { title: 'Mining', content: 'Hash rate increases. Mining profitability soars.' },
            ]
        },
        status: 'completed',
    }
};

const EMPTY_REPORT = {
    node: 'node-empty',
    simulation_id: 'sim_004',
    topic: '如果比特幣突破15萬',
    report: { status: 'pending' },
};


function runTests() {
    console.log('\n🧪 meta-report.js tests\n');

    // --- mergeReports ---
    test('mergeReports: merges 2 reports into meta-report', () => {
        const meta = metaReport.mergeReports([REPORT_A, REPORT_B]);
        assert.ok(meta.topic, 'should have topic');
        assert.strictEqual(meta.nodeCount, 2);
        assert.ok(meta.nodes.includes('node-a'));
        assert.ok(meta.nodes.includes('node-b'));
        assert.ok(meta.sections.length > 0, 'should have merged sections');
    });

    test('mergeReports: handles 3+ reports', () => {
        const meta = metaReport.mergeReports([REPORT_A, REPORT_B, REPORT_C]);
        assert.strictEqual(meta.nodeCount, 3);
        assert.ok(meta.sections.length >= 3);
    });

    test('mergeReports: skips pending/incomplete reports', () => {
        const meta = metaReport.mergeReports([REPORT_A, EMPTY_REPORT]);
        assert.strictEqual(meta.nodeCount, 1);
        assert.ok(!meta.nodes.includes('node-empty'));
    });

    test('mergeReports: returns empty meta for no valid reports', () => {
        const meta = metaReport.mergeReports([EMPTY_REPORT]);
        assert.strictEqual(meta.nodeCount, 0);
        assert.strictEqual(meta.sections.length, 0);
    });

    test('mergeReports: handles empty input', () => {
        const meta = metaReport.mergeReports([]);
        assert.strictEqual(meta.nodeCount, 0);
    });

    // --- formatMetaReport ---
    test('formatMetaReport: produces readable markdown', () => {
        const meta = metaReport.mergeReports([REPORT_A, REPORT_B]);
        const md = metaReport.formatMetaReport(meta);
        assert.ok(md.includes('# '), 'should have markdown header');
        assert.ok(md.includes('node-a'), 'should mention source nodes');
        assert.ok(md.includes('node-b'));
        assert.ok(md.includes('如果比特幣突破15萬'), 'should include topic');
    });

    test('formatMetaReport: shows section sources', () => {
        const meta = metaReport.mergeReports([REPORT_A, REPORT_B]);
        const md = metaReport.formatMetaReport(meta);
        // Each section should attribute its source node
        assert.ok(md.includes('node-a') || md.includes('node-b'));
    });

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
