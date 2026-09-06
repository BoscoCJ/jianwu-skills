/**
 * 防折叠混淆算法（anti-fold.js）
 *
 * 核心方法：Unicode 排版方向控制字符（RLO/PDF）
 * - RLO (Right-to-Left Override, U+202E)：让后续文本反向显示
 * - PDF (Pop Directional Formatting, U+202C)：恢复正常方向
 *
 * 原理：
 * 原文：我见过 → 转为：我‮过见‬
 * 字符顺序：我 + RLO + 过 + 见 + PDF
 * 显示效果：正确（因为 RLO 使 "过见" 反向显示为 "见过"）
 * 微信检测：字符序列被打乱，绕过哈希值检测
 *
 * 辅助方法：零宽字符混淆（备选方案）
 * - ​ 零宽空格 (Zero Width Space)
 * - ‌ 零宽非连接符 (Zero Width Non-Joiner)
 * - ‍ 零宽连接符 (Zero Width Joiner)
 * - ﻿ 零宽无间断空格 (Zero Width No-Break Space)
 */

const RLO = '‮';  // Right-to-Left Override
const PDF = '‬';  // Pop Directional Formatting
const LRO = '‭';  // Left-to-Right Override

// 混淆强度配置
const INTENSITY = {
    light: { method: 'zero-width', density: 0.15 },       // 轻度：零宽字符，15% 密度
    medium: { method: 'rlo-pdf', density: 0.25 },         // 中度：RLO/PDF，25% 密度（默认）
    heavy: { method: 'hybrid', density: 0.4 }             // 重度：RLO/PDF + 零宽字符混合，40% 密度
};

// 零宽字符池
const ZERO_WIDTH_CHARS = [
    '​',  // 零宽空格
    '‌',  // 零宽非连接符
    '‍',  // 零宽连接符
    '﻿'   // 零宽无间断空格
];

/**
 * RLO/PDF 方法混淆（核心方法 - 完全随机）
 * 随机选择短语用 RLO + PDF 包裹，使其反向显示
 * 每次生成都不同，绕过微信的重复检测
 */
function antiFoldWithRLORandomly(text, density = 0.25) {
    const RLO = '‮';
    const PDF = '‬';

    // 分句处理（按。！？等标点分割）
    const sentences = text.split(/([。！？，；\n])/);

    let result = '';
    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];

        // 非文字内容直接保留
        if (!sentence || /^[。！？，；\n]$/.test(sentence)) {
            result += sentence;
            continue;
        }

        // 随机决定是否对这个句子中的词进行反向
        if (Math.random() < density && sentence.length > 2) {
            // 随机选择一个 2-4 字的子串进行反向
            const maxSubLen = Math.min(4, sentence.length);
            const minSubLen = 2;
            const subLen = Math.floor(Math.random() * (maxSubLen - minSubLen + 1)) + minSubLen;

            // 随机选择起点
            const maxStart = sentence.length - subLen;
            const startPos = Math.floor(Math.random() * (maxStart + 1));

            const before = sentence.slice(0, startPos);
            const target = sentence.slice(startPos, startPos + subLen);
            const after = sentence.slice(startPos + subLen);

            result += before + RLO + target + PDF + after;
        } else {
            result += sentence;
        }
    }

    return result;
}

/**
 * 零宽字符随机混淆（辅助方法）
 * 完全随机插入位置和字符类型
 */
function antiFoldWithZeroWidthRandomly(text, density = 0.3) {
    const chars = ['​', '‌', '‍', '﻿'];
    let result = '';

    for (let i = 0; i < text.length; i++) {
        result += text[i];

        // 每个字符后都有可能插入零宽字符（不是固定间隔！）
        if (Math.random() < density) {
            const randomChar = chars[Math.floor(Math.random() * chars.length)];
            result += randomChar;
        }
    }

    return result;
}

/**
 * 混合随机混淆（最强 - 将多种方法组合）
 * 每次调用都生成完全不同的结果
 */
function antiFoldHybridRandomly(text, intensity = 'medium') {
    const config = {
        light: { rlo: 0.15, zw: 0.1 },      // 轻度
        medium: { rlo: 0.25, zw: 0.15 },    // 中度（默认）
        heavy: { rlo: 0.35, zw: 0.25 }      // 重度
    };

    const cfg = config[intensity] || config.medium;

    // 随机选择先用哪种方法（增加变化性）
    let result = text;

    if (Math.random() < 0.6) {
        // 60% 概率先用 RLO
        result = antiFoldWithRLORandomly(result, cfg.rlo);
        result = antiFoldWithZeroWidthRandomly(result, cfg.zw);
    } else {
        // 40% 概率先用零宽字符
        result = antiFoldWithZeroWidthRandomly(result, cfg.zw);
        result = antiFoldWithRLORandomly(result, cfg.rlo);
    }

    return result;
}

/**
 * 防折叠混淆处理（主入口 - 完全随机版）
 * @param {string} text - 原始文本
 * @param {string} intensity - 混淆强度（light/medium/heavy），默认 medium
 * @returns {string} - 混淆后的文本
 */
function antiFoldProcess(text, intensity = 'medium') {
    if (!text || text.length === 0) return text;

    // 使用混合随机混淆作为主方法
    return antiFoldHybridRandomly(text, intensity);
}

/**
 * 智能分段处理
 * 将长文本按合适的位置分段，避免一次性载入监控
 * @param {string} text - 原始文本
 * @param {number} maxSegmentLength - 每段最大长度，默认 100
 * @returns {string} - 分段后的文本
 */
function smartSplit(text, maxSegmentLength = 100) {
    if (!text || text.length <= maxSegmentLength) return text;

    const segments = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxSegmentLength) {
            segments.push(remaining);
            break;
        }

        // 在合适的位置断句（优先在标点符号处断开）
        let splitIndex = maxSegmentLength;
        const punctuation = ['。', '！', '？', '；', '\n'];

        for (let i = maxSegmentLength; i > maxSegmentLength - 20; i--) {
            if (punctuation.includes(remaining[i])) {
                splitIndex = i + 1;
                break;
            }
        }

        segments.push(remaining.slice(0, splitIndex));
        remaining = remaining.slice(splitIndex);
    }

    return segments.join('\n');
}

/**
 * 清理多余标点和换行
 * @param {string} text - 原始文本
 * @returns {string} - 清理后的文本
 */
function cleanText(text) {
    if (!text) return text;

    let result = text;

    // 1. 清理连续多个句号（保留一个）
    result = result.replace(/。{2,}/g, '。');

    // 2. 清理连续多个换行（最多保留 2 个）
    result = result.replace(/\n{3,}/g, '\n\n');

    // 3. 清理行末多余空格
    result = result.replace(/[ \t]+$/gm, '');

    // 4. 统一标点符号（全角）
    result = result.replace(/,/g, '，');
    result = result.replace(/\./g, '。');
    result = result.replace(/!/g, '！');
    result = result.replace(/\?/g, '？');

    return result;
}

/**
 * 获取随机整数（包含 min 和 max）
 */
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 复制文案到剪贴板（带防折叠）
 * @param {string} text - 要复制的文本
 * @param {string} intensity - 混淆强度
 */
async function copyToClipboard(text, intensity = 'medium') {
    // 1. 清理文本
    const cleanedText = cleanText(text);

    // 2. 防折叠混淆
    const processedText = antiFoldProcess(cleanedText, intensity);

    // 3. 写入剪贴板
    try {
        await navigator.clipboard.writeText(processedText);
        return true;
    } catch (err) {
        console.error('[AntiFold] 复制失败:', err);
        // 降级方案：使用 execCommand
        const textarea = document.createElement('textarea');
        textarea.value = processedText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            return true;
        } catch (e) {
            console.error('[AntiFold] 降级复制也失败:', e);
            return false;
        } finally {
            document.body.removeChild(textarea);
        }
    }
}

// 导出函数（如果在 Node.js 环境）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        antiFoldProcess,
        smartSplit,
        cleanText,
        copyToClipboard,
        INTENSITY
    };
}
