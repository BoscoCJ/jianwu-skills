# jianwu-skills

**WorkBuddy 技能集合** —— 为 AI 助手开发的实用技能包

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📦 技能列表

| 技能 | 描述 | 版本 | 状态 |
|------|------|------|------|
| [html-ppt-remote](./skills/html-ppt-remote/) | HTML 幻灯片翻页笔遥控 + 智能全屏 | v2.0 | ✅ 稳定 |

---

## 🚀 快速开始

### 安装到 WorkBuddy

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/jianwu-skills.git

# 复制技能到 WorkBuddy 技能目录
cp -r jianwu-skills/skills/html-ppt-remote ~/.workbuddy/skills/
```

### 使用技能

每个技能都有独立的使用说明，查看对应目录的 `README.md`。

---

## 📁 项目结构

```
jianwu-skills/
├── README.md           # 项目总览（本文件）
├── LICENSE             # MIT 开源协议
├── .gitignore
├── docs/
│   └── CHANGELOG.md    # 更新日志
├── skills/             # 所有技能
│   └── html-ppt-remote/
│       ├── SKILL.md
│       ├── README.md
│       ├── slide-remote.js
│       └── test.html
└── templates/          # 技能模板
    └── skill-template/
```

---

## 🛠️ 开发新技能

1. 复制模板：
   ```bash
   cp -r templates/skill-template skills/your-skill-name
   ```

2. 修改模板中的文件：
   - `SKILL.md` —— 技能元数据
   - `README.md` —— 使用说明
   - 代码文件（.js / .html）

3. 测试技能：
   - 复制到 `~/.workbuddy/skills/`
   - 在 WorkBuddy 中测试触发词

4. 提交到仓库：
   ```bash
   git add skills/your-skill-name
   git commit -m "feat: add your-skill-name"
   ```

---

## 📝 开发规范

### 技能结构标准

每个技能必须包含：

| 文件 | 必需 | 说明 |
|------|------|------|
| `SKILL.md` | ✅ | 技能元数据（名称、描述、触发词） |
| `README.md` | ✅ | 详细使用说明 |
| 代码文件 | ✅ | .js / .html / .css 等 |
| `test.html` | 推荐 | 可独立运行的测试页 |

### 代码风格

- 使用 ES6+ 语法
- 注释清晰，中英文皆可
- 避免硬编码，支持配置化
- 测试页必须可独立运行（不依赖服务器）

---

## 🤝 贡献指南

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

## 📄 开源协议

[MIT License](./LICENSE)

---

## 👤 作者

**陈嘉杰（健吾）**

- 明理文化 AI 布道者
- 深二代创业者
- 用 AI 训练人的思维，让人感受世界

---

## 🔗 相关链接

- [WorkBuddy](https://workbuddy.cn)
- [明理文化](https://mingli.cn)

---

**让 AI 干重复性的累活，让人持续训练思维。**
