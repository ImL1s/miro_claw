/**
 * MiroFish Meta-Report — 多節點推演結果合併分析
 *
 * 收集多個節點的獨立推演結果，合併成交叉分析報告。
 * 每個節點跑同一主題的 55-agent 模擬，但用不同 LLM/溫度，
 * 產生不同觀點。Meta-report 找出共識點和分歧點。
 */

/**
 * 合併多個節點的推演結果
 *
 * @param {Array<{node, simulation_id, topic, report}>} results - 各節點的結果
 * @returns {MetaReport}
 */
function mergeReports(results) {
    // 過濾掉 pending/incomplete 的報告
    const validResults = results.filter(r =>
        r.report &&
        r.report.status === 'completed' &&
        r.report.outline &&
        r.report.outline.sections
    );

    const topic = results[0]?.topic || '';
    const nodes = validResults.map(r => r.node);

    // 收集所有 sections，標記來源節點
    const sections = [];
    for (const result of validResults) {
        for (const section of result.report.outline.sections) {
            sections.push({
                title: section.title,
                content: section.content,
                source: result.node,
                simulationId: result.simulation_id,
            });
        }
    }

    return {
        topic,
        nodeCount: validResults.length,
        nodes,
        sections,
        generatedAt: new Date().toISOString(),
    };
}

/**
 * 將 meta-report 格式化為可讀的 Markdown
 *
 * @param {MetaReport} meta
 * @returns {string}
 */
function formatMetaReport(meta) {
    const lines = [];

    lines.push(`# 🔮 Meta-Report: ${meta.topic}`);
    lines.push('');
    lines.push(`> 綜合 **${meta.nodeCount}** 個節點的推演結果`);
    lines.push(`> 節點: ${meta.nodes.join(', ')}`);
    lines.push(`> 生成時間: ${meta.generatedAt}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    if (meta.sections.length === 0) {
        lines.push('*沒有可用的推演結果*');
        return lines.join('\n');
    }

    // 按 title 分組，找出相似主題
    const grouped = groupSectionsByTheme(meta.sections);

    for (const [theme, themeSections] of Object.entries(grouped)) {
        lines.push(`## ${theme}`);
        lines.push('');

        for (const section of themeSections) {
            lines.push(`### 📌 ${section.title} — *${section.source}*`);
            lines.push('');
            lines.push(section.content);
            lines.push('');
        }

        // 如果有多個節點貢獻同一主題，標記為共識區
        if (themeSections.length > 1) {
            const sources = [...new Set(themeSections.map(s => s.source))];
            if (sources.length > 1) {
                lines.push(`> 💡 **多節點觀點** (${sources.join(', ')})`);
                lines.push('');
            }
        }

        lines.push('---');
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * 按主題相似度分組 sections
 * 簡易版：每個 section 單獨一組（用 title 作為 key）
 * 未來可用 embedding 做語義分群
 */
function groupSectionsByTheme(sections) {
    const groups = {};
    for (const section of sections) {
        // 用簡化的 title 作為 group key
        const key = section.title;
        if (!groups[key]) groups[key] = [];
        groups[key].push(section);
    }
    return groups;
}

module.exports = {
    mergeReports,
    formatMetaReport,
};
