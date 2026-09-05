const fs = require('fs');
const path = require('path');

// 读取模板（从命令行参数获取模板名称）
const templateName = process.argv[3] || 'default';
const templatePath = path.join(__dirname, '..', 'templates', templateName + '.html');

if (!fs.existsSync(templatePath)) {
    console.error(' 模板不存在:', templatePath);
    console.log('可用模板：default, traditional, geek, cyberpunk, consulting');
    process.exit(1);
}

const template = fs.readFileSync(templatePath, 'utf-8');

// 读取测试数据（从命令行参数获取）
const dataFile = process.argv[2] || 'test-data.json';
const dataPath = path.join(__dirname, '..', 'assets', dataFile);

if (!fs.existsSync(dataPath)) {
    console.error(' 数据文件不存在:', dataPath);
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

// 替换占位符
let html = template;
html = html.replace(/\{\{TITLE\}\}/g, data.title);
html = html.replace(/\{\{SUBTITLE\}\}/g, data.subtitle);
html = html.replace(/\{\{META\}\}/g, data.meta);
html = html.replace(/\{\{QR_CODE\}\}/g, data.qrCode || '');
html = html.replace(/\{\{FOOTER_TEXT\}\}/g, data.footerText);
html = html.replace(/\{\{DATA_JSON\}\}/g, JSON.stringify(data.stages));

// 输出 HTML
const dataName = dataFile.replace('.json', '');
const outputName = dataName + '-' + templateName + '.html';
const outputPath = path.join(__dirname, 'output', outputName);
const outputDir = path.dirname(outputPath);

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, html, 'utf-8');
console.log('✅ HTML 生成成功:', outputPath);
