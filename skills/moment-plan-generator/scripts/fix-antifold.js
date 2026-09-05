const fs = require('fs');
const path = require('path');

// 优化后的 antiFoldProcess 函数（使用 Unicode 转义确保字符不丢失）
const optimizedFunction = `
        // 防折叠混淆算法（优化版：确保最少插入数量和字符类型覆盖）
        function antiFoldProcess(text, intensity = 'medium') {
            if (!text || text.length === 0) return text;

            const config = {
                light: { min: 1, max: 3, interval: 20 },
                medium: { min: 2, max: 4, interval: 12 },
                heavy: { min: 4, max: 6, interval: 6 }
            };
            const chars = ['\\u200B', '\\u200C', '\\u200D', '\\uFEFF'];
            const cfg = config[intensity] || config.medium;

            const minInserts = cfg.min;
            const intervalInserts = Math.floor(text.length / cfg.interval);
            const totalInserts = Math.max(minInserts, intervalInserts);

            let result = text;
            let charIndex = 0;
            let inserted = 0;

            // 均匀分布插入（确保位置合法）
            if (totalInserts > 0 && result.length > 0) {
                const step = Math.max(1, Math.floor(result.length / totalInserts));
                for (let i = 0; i < totalInserts && inserted < totalInserts; i++) {
                    const insertPos = Math.min((i + 1) * step, result.length);
                    const char = chars[charIndex % chars.length];
                    result = result.slice(0, insertPos) + char + result.slice(insertPos);
                    charIndex++;
                    inserted++;
                }
            }

            // 额外随机插入（增加变化性）
            for (let i = result.length; i > 0 && inserted < minInserts; i--) {
                if (Math.random() < 0.5) {
                    const char = chars[Math.floor(Math.random() * chars.length)];
                    result = result.slice(0, i) + char + result.slice(i);
                    inserted++;
                }
            }

            return result;
        }
`;

// 所有模板文件
const templates = ['default.html', 'traditional.html', 'geek.html', 'cyberpunk.html', 'consulting.html'];
const templatesDir = path.join(__dirname, '..', 'templates');

templates.forEach(template => {
    const filePath = path.join(templatesDir, template);

    if (!fs.existsSync(filePath)) {
        console.log(`⚠️ 模板不存在：${template}`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf-8');

    // 替换旧的 antiFoldProcess 函数（从函数定义到下一个函数定义之前）
    const oldFunctionPattern = /        \/\/ 防折叠混淆算法[\s\S]*?return result;\n        \}/;
    content = content.replace(oldFunctionPattern, optimizedFunction.trim());

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ 更新：${template}`);
});

console.log('\n🎉 所有模板已更新！');
