/**
 * 防折叠混淆算法（anti-fold.js）
 *
 * 原理：在文本中随机插入零宽字符，打破微信的重复性检测
 *
 * 零宽字符类型：
 * - ​ 零宽空格 (Zero Width Space)
 * - ‌ 零宽非连接符 (Zero Width Non-Joiner)
 * - ‍ 零宽连接符 (Zero Width Joiner)
 * - ﻿ 零宽无间断空格 (Zero Width No-Break Space)
 *
 * 这些字符不可见，不影响阅读，但能改变文本的哈希值
 */

// 混淆强度配置
const INTENSITY = {
    light: { min: 20, max: 30 },      // 轻度：每 20-30 个字符插入
    medium: { min: 10, max: 15 },     // 中度：每 10-15 个字符插入（默认）
    heavy: { min: 5, max: 8 }         // 重度：每 5-8 个字符插入
};

// 零宽字符池
const ZERO_WIDTH_CHARS = [
    '​',  // 零宽空格
    '‌',  // 零宽非连接符
    '‍',  // 零宽连接符
    '﻿'   // 零宽无间断空格
];

/**
 * 防折叠混淆处理（优化版：确保最少插入数量和字符类型覆盖）
 * @param {string} text - 原始文本
 * @param {string} intensity - 混淆强度（light/medium/heavy），默认 medium
 * @returns {string} - 混淆后的文本
 */
function antiFoldProcess(text, intensity = 'medium') {
    if (!text || text.length === 0) return text;

    const config = {
        light: { min: 1, max: 3, interval: 20 },   // 轻度：至少 1 个，每 20 字插入
        medium: { min: 2, max: 4, interval: 12 },  // 中度：至少 2 个，每 12 字插入
        heavy: { min: 4, max: 6, interval: 6 }     // 重度：至少 4 个，每 6 字插入
    };
    const chars = ['​', '‌', '‍', '﻿'];
    const cfg = config[intensity] || config.medium;

    // 计算需要插入的字符数量
    const minInserts = cfg.min;
    const intervalInserts = Math.floor(text.length / cfg.interval);
    const totalInserts = Math.max(minInserts, intervalInserts);

    let result = text;
    let charIndex = 0; // 用于循环选择字符类型

    // 均匀分布插入位置
    const step = Math.floor(result.length / totalInserts);
    for (let i = 0; i < totalInserts; i++) {
        const insertPos = (i + 1) * step;
        if (insertPos <= result.length) {
            const char = chars[charIndex % chars.length];
            result = result.slice(0, insertPos) + char + result.slice(insertPos);
            charIndex++;
        }
    }

    // 额外随机插入一些（增加变化性）
    for (let i = result.length; i > 0; i--) {
        if (Math.random() < 0.3) {
            const char = chars[Math.floor(Math.random() * chars.length)];
            result = result.slice(0, i) + char + result.slice(i);
        }
    }

    return result;
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
