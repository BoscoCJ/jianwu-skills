# 更新日志

## [Unreleased]

### 计划中
- [ ] 更多实用技能开发中...

---

## [2026-08-10] - 项目启动

### 新增
- 🎉 初始化 `jianwu-skills` 项目
- ✨ 添加第一个技能：`html-ppt-remote`（v2.0）
  - 四层检测架构：DOM 快速检测 → 事件捕获 → MutationObserver → 键盘计数器
  - 兼容所有 HTML 幻灯片结构（已知和未知）
  - 翻页笔遥控 + 智能全屏

### 技能详情

#### html-ppt-remote v2.0
- **功能**：HTML 幻灯片翻页笔遥控 + 智能全屏
- **特性**：
  - 第一页按"上一页" → 自动全屏
  - 最后一页按"下一页" → 自动退出全屏
  - 兼容 `<deck-stage>`、`.slide + .active`、`#deck + translateX`、Swiper.js、reveal.js
  - 兼容未知结构（键盘计数器兜底）
- **文件**：
  - `slide-remote.js` - 核心脚本（144行）
  - `SKILL.md` - 技能元数据
  - `README.md` - 使用说明
  - `test.html` - 测试页（普通结构）
  - `test-deck-stage.html` - 测试页（web component）

---

## 格式说明

每个版本的格式：

```markdown
## [YYYY-MM-DD] - 版本标题

### 新增
- 新功能

### 变更
- 改进/修改

### 修复
- Bug 修复

### 移除
- 删除的功能

### 废弃
- 即将删除的功能
```
