# jianwu-skills

**跨平台 AI Agent 技能集合** —— 一次编写，到处运行

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Agent Skills Standard](https://img.shields.io/badge/SKILL.md-Open%20Standard-blueviolet)](https://github.com/anthropics/agent-skills)

---

## 跨平台兼容

本仓库所有技能遵循 [Agent Skills 开放标准](https://github.com/anthropics/agent-skills)，`SKILL.md` 格式一次编写，跨 30+ AI 编码工具通用。

### 代码兼容性（浏览器端 JS）

| AI 编码平台 | 生成的 HTML 可用 | 兼容 |
|-------------|-----------------|------|
| WorkBuddy | ✅ | ✅ |
| Claude Code | ✅ | ✅ |
| OpenAI Codex CLI | ✅ | ✅ |
| Trae（字节跳动） | ✅ | ✅ |
| Cursor | ✅ | ✅ |
| GitHub Copilot | ✅ | ✅ |
| Windsurf | ✅ | ✅ |
| Google Gemini CLI | ✅ | ✅ |
| Qoder（阿里） | ✅ | ✅ |
| 任意 AI 生成的 HTML | ✅ | ✅ |

### SKILL.md 指令识别

| AI 编码平台 | 安装路径 | 识别方式 | 兼容 |
|-------------|----------|----------|------|
| WorkBuddy | `~/.workbuddy/skills/` | 原生 | ✅ |
| Claude Code | `~/.claude/skills/` | 原生 | ✅ |
| OpenAI Codex CLI | `~/.codex/skills/` 或 `.agents/skills/` | 原生 | ✅ |
| Trae（字节跳动） | `~/.trae/skills/` | 原生 | ✅ |
| Qoder（阿里） | `~/.qoder/skills/` | 原生 | ✅ |
| Google Gemini CLI | `~/.gemini/skills/` | 原生 | ✅ |
| Cursor | `.cursor/rules/` | 需转换 | ⚠️ |
| Windsurf | `.windsurfrules` | 需转换 | ⚠️ |
| GitHub Copilot | `.github/skills/` | 原生 | ✅ |

---

## 技能列表

| 技能 | 描述 | 版本 | 状态 |
|------|------|------|------|
| [html-ppt-remote](./skills/html-ppt-remote/) | HTML 幻灯片翻页笔遥控 + 智能全屏 | v2.0 | ✅ 稳定 |

---

## 快速开始

### 一键安装

选择你的平台：

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/jianwu-skills.git
cd jianwu-skills

# WorkBuddy
cp -r skills/html-ppt-remote ~/.workbuddy/skills/

# Claude Code
cp -r skills/html-ppt-remote ~/.claude/skills/

# Codex CLI
cp -r skills/html-ppt-remote ~/.codex/skills/

# Trae
cp -r skills/html-ppt-remote ~/.trae/skills/

# Qoder
cp -r skills/html-ppt-remote ~/.qoder/skills/

# GitHub Copilot
cp -r skills/html-ppt-remote .github/skills/
```

### 使用技能

每个技能都有独立的使用说明，查看对应目录的 `README.md`。

---

## 项目结构

```
jianwu-skills/
├── README.md           # 项目总览（本文件）
├── LICENSE             # MIT 开源协议
├── .gitignore
├── docs/
│   └── CHANGELOG.md    # 更新日志
├── skills/             # 所有技能
│   └── html-ppt-remote/
│       ├── SKILL.md    # 技能元数据（跨平台通用）
│       ├── README.md   # 详细使用说明
│       ├── slide-remote.js
│       └── test.html
└── templates/          # 新建技能的模板
    └── skill-template/
```

---


## 开发规范

### 技能结构标准

| 文件 | 必需 | 说明 |
|------|------|------|
| `SKILL.md` | ✅ | 技能元数据（名称、描述、触发词）—— 遵循 Agent Skills 开放标准 |
| `README.md` | ✅ | 详细使用说明 |
| 代码文件 | ✅ | .js / .html / .css 等 |
| `test.html` | 推荐 | 可独立运行的测试页 |

### 代码风格

- 使用 ES6+ 语法
- 注释清晰，中英文皆可
- 避免硬编码，支持配置化
- 测试页必须可独立运行（不依赖服务器）

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

### 提交流程

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feat/your-skill`
3. 提交更改：`git commit -m 'feat: add your-skill'`
4. 推送分支：`git push origin feat/your-skill`
5. 提交 Pull Request

### Commit 规范

```
feat: 新功能
fix: 修复问题
docs: 文档更新
style: 代码格式调整
refactor: 重构代码
test: 测试相关
chore: 构建/工具更新
```

---

## 开源协议

[MIT License](./LICENSE)

---

## 作者

**健吾**

- 明理文化 AI 布道者
- 用文化赋能AI，用思维驾驭AI

---

## 相关链接

- [Agent Skills 开放标准](https://github.com/anthropics/agent-skills)
- [WorkBuddy](https://workbuddy.cn)

---

**让 AI 干重复性的累活，让人持续训练思维。**
