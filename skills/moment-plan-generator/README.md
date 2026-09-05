# moment-plan-generator

> 朋友圈文案可视化生成器

将 Markdown 文案、聊天记录或已确认的朋友圈内容文档，转换为**可交互的 HTML 页面**。

---

## ✨ 核心功能

### 1. 多风格模板 

提供 5 种视觉风格，适配不同品牌调性：

| 风格 | 适用场景 | 视觉特点 |
|------|---------|---------|
| **default** | 通用、温暖、有质感 | 暖金色调，柔和排版 |
| **traditional** | 国学、文化、历史 | 朱红/墨黑，楷体字，宣纸纹理 |
| **geek** | 科技、互联网、AI | 深蓝/荧光绿，等宽字体，代码感 |
| **cyberpunk** | 潮流、年轻、创意 | 霓虹紫/品红，高对比，未来感 |
| **consulting** | 商务、咨询、企业 | 深蓝/灰色，简洁严谨 |

### 2. 自动日期跳转 

根据当前日期，自动定位到当天应该发的朋友圈内容。

### 3. 一键复制 + 防折叠混淆 📋

- 每条文案都有复制按钮
- 复制时自动插入**零宽字符**，避免微信朋友圈折叠
- 支持三档强度：轻度/中度/重度

### 4. 文案优化 ✏️

- 清理多余换行和句号
- 统一标点符号
- 重新排版，提升可读性

---

## 📁 项目结构

```
moment-plan-generator/
├── SKILL.md                      # WorkBuddy 技能定义
├── README.md                     # 本文件
├── references/
│   └── styles-guide.md           # 风格选择指南
├── scripts/
│   ├── anti-fold.js              # 防折叠混淆算法（源文件）
│   ├── generate.js               # HTML 生成脚本
│   ── fix-antifold.js           # 批量更新模板脚本
├── templates/
│   ├── default.html              # 默认风格模板
│   ├── traditional.html          # 中国传统文化风
│   ├── geek.html                 # 极客科技风
│   ├── cyberpunk.html            # 赛博朋克风
│   └── consulting.html           # 咨询公司风
└── assets/
    ├── test-data.json            # 测试数据（明理之光）
    ├── test-data-feng8.json      # 测试数据（逢 8 共享会）
    └── fangzhedie.png            # 防折叠小程序二维码（可选）
```

---

##  快速开始

### 安装

```bash
# 克隆仓库
git clone <repository-url>
cd moment-plan-generator
```

### 生成 HTML

```bash
# 使用默认模板
node scripts/generate.js <数据文件.json>

# 指定风格模板
node scripts/generate.js <数据文件.json> <模板名称>

# 示例
node scripts/generate.js test-data-feng8.json default
node scripts/generate.js test-data-feng8.json traditional
node scripts/generate.js test-data-feng8.json geek
node scripts/generate.js test-data-feng8.json cyberpunk
node scripts/generate.js test-data-feng8.json consulting
```

生成的 HTML 文件会保存在 `scripts/output/` 目录下。

### 本地预览

```bash
# 方法 1：直接打开
# 双击 scripts/output/xxx.html

# 方法 2：本地服务器（推荐）
cd scripts/output
python -m http.server 8080
# 浏览器打开 http://localhost:8080/xxx.html

# 方法 3：Node.js 服务器
npm install -g http-server
cd scripts/output
http-server -p 8080
```

---

## 📝 数据格式

JSON 格式，包含以下字段：

```json
{
  "title": "标题",
  "subtitle": "副标题",
  "meta": "元信息",
  "qrCode": "二维码图片路径（可选）",
  "footerText": "页脚文字",
  "stages": [
    {
      "title": "阶段标题",
      "date": "日期",
      "description": "阶段描述",
      "posts": [
        {
          "badge": "标签",
          "date": "发布日期",
          "sequence": "序号",
          "title": "文案标题（可选）",
          "content": "文案内容（支持 HTML）",
          "imageSuggestion": "配图建议（可选）"
        }
      ]
    }
  ]
}
```

---

## ️ 防折叠功能

### 原理

在文本中随机插入**零宽字符**（不可见 Unicode 字符），打破微信的重复性检测：

- `​` 零宽空格 (U+200B)
- `‌` 零宽非连接符 (U+200C)
- `‍` 零宽连接符 (U+200D)
- `﻿` 零宽无间断空格 (U+FEFF)

### 强度配置

| 强度 | 最少插入 | 间隔（字数） | 适用场景 |
|------|---------|-------------|---------|
| 轻度 | 1 个 | 每 20 字 | 短文、日常分享 |
| 中度 | 2 个 | 每 12 字 | 标准朋友圈（默认） |
| 重度 | 4 个 | 每 6 字 | 长文、营销文案 |

### 验证测试

打开生成的 HTML，在控制台运行：

```javascript
console.log('函数存在:', typeof antiFoldProcess === 'function');
var t = "测试文案";
var result = antiFoldProcess(t, 'medium');
console.log('原文:', t.length, '→ 处理后:', result.length);
console.log('包含零宽字符:', /[\u200B\u200C\u200D\uFEFF]/.test(result));
```

---

## 🎯 使用场景

### 场景 1：团队朋友圈管理

为团队生成统一的朋友圈文案页面，每个人：
1. 打开 HTML 页面
2. 自动定位到今天的文案
3. 点击复制（自带防折叠）
4. 粘贴到微信朋友圈发布

### 场景 2：个人 IP 打造

将个人故事、观点、案例整理成文案库，生成 HTML 页面：
- 按主题分类
- 按日期排序
- 快速查找和复制

### 场景 3：营销活动

为营销活动生成倒计时文案、活动预告、见证分享等：
- 统一视觉风格
- 统一发布时间
- 统一品牌调性

---

##  发布到 WorkBuddy

### 打包技能

```bash
# 压缩为 zip
cd D:\AI\jianwu-skills\skills
zip -r moment-plan-generator.zip moment-plan-generator/
```

### 上传到 WorkBuddy

1. 登录 WorkBuddy 开放平台
2. 进入「技能市场」→「创建技能」
3. 上传 `moment-plan-generator.zip`
4. 填写技能信息（名称、描述、分类等）
5. 提交审核

---

## 🧪 测试

### 运行测试

```bash
# 生成测试 HTML
node scripts/generate.js test-data-feng8.json default

# 打开浏览器预览
# http://localhost:8080/test-data-feng8-default.html

# 在控制台运行测试代码
# （见 README 中的"验证测试"部分）
```

### 测试清单

- [ ] 函数存在性验证
- [ ] 三种强度递增验证
- [ ] 批量文案处理验证
- [ ] 零宽字符类型覆盖验证
- [ ] 复制粘贴完整性验证
- [ ] 实际朋友圈发布测试

---

##  贡献

欢迎提交 Issue 和 Pull Request！

### 添加新模板

1. 在 `templates/` 目录下创建新的 HTML 文件
2. 复制现有模板结构
3. 修改 CSS 样式（配色、字体、布局）
4. 保持 JS 功能不变
5. 提交 Pull Request

---

## 📄 许可证

MIT License

---

##  致谢

- 防折叠算法灵感来自微信生态运营实践
- 模板设计参考了多种视觉风格

---

##  联系方式

- GitHub: [your-github](https://github.com/your-github)
- Email: your-email@example.com
