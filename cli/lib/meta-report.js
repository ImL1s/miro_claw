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
    // 支援兩種報告格式：
    //   1. 舊版：report.outline.sections（結構化）
    //   2. 現版：report.markdown_content（Markdown 文本）
    const validResults = results.filter(r => {
        if (!r.report) return false
        if (r.report.status && r.report.status !== 'completed') return false
        // 接受有 outline.sections 或 markdown_content 的報告
        return (r.report.outline && r.report.outline.sections) ||
               r.report.markdown_content
    });

    const topic = results[0]?.topic || '';
    const nodes = validResults.map(r => r.node);

    // 收集所有 sections，標記來源節點
    const sections = [];
    for (const result of validResults) {
        // 優先使用結構化 sections
        if (result.report.outline && result.report.outline.sections) {
            for (const section of result.report.outline.sections) {
                sections.push({
                    title: section.title,
                    content: section.content,
                    source: result.node,
                    simulationId: result.simulation_id,
                });
            }
        } else if (result.report.markdown_content) {
            // 解析 markdown_content 為 sections（按 ## 標題切割）
            const parsed = parseMarkdownSections(result.report.markdown_content)
            for (const section of parsed) {
                sections.push({
                    title: section.title,
                    content: section.content,
                    source: result.node,
                    simulationId: result.simulation_id,
                });
            }
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
 * 將 Markdown 文本按 ## 標題解析成 sections
 * @param {string} markdown
 * @returns {Array<{title: string, content: string}>}
 */
function parseMarkdownSections(markdown) {
    const sections = []
    // 按 ## 標題分割（不含 # 一級標題）
    const parts = markdown.split(/^## /m)
    for (let i = 1; i < parts.length; i++) {
        const part = parts[i]
        const newlineIdx = part.indexOf('\n')
        if (newlineIdx === -1) {
            sections.push({ title: part.trim(), content: '' })
        } else {
            sections.push({
                title: part.slice(0, newlineIdx).trim(),
                content: part.slice(newlineIdx + 1).trim(),
            })
        }
    }
    // 如果沒找到 ## 標題，把整篇當作一個 section
    if (sections.length === 0 && markdown.trim()) {
        const firstLine = markdown.trim().split('\n')[0].replace(/^#+\s*/, '')
        sections.push({
            title: firstLine || '報告內容',
            content: markdown.trim(),
        })
    }
    return sections
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
