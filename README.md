# dsh-workspace-statuscard

DSH（DeepSeek Harness）侧栏工作区的"活跃区优先"重实现：在原工作区列表上方常驻一块**活跃会话区**，按会话（而非项目）展示最近活跃的会话，置顶需要你介入的会话。

以 `priority: -1` 抢占侧栏 `sidebar.workspaces` single slot，在同一个组件里渲染上下两段；禁用本插件后官方 WorkspaceBrowser 自动恢复。

## 功能

**活跃区（上段）**
- 筛选：仅展示最近 N 天内有过活动的会话（默认 3 天，设置页可改），归档/子代理/空白会话不进入。
- 排序：需要介入 → 执行中 → 已完成（"最近完成"分组靠后），组内按最后活动时间倒序；单纯打开会话不刷新活跃时间。
- 卡片：会话标题、归属项目（彩色缩写头像 + 项目名）、状态徽章、相对时间、完成未读绿点。
- 悬停展开：项目路径、最近活动绝对时间、最近消息预览（懒加载 `turnOutline` 投影，取不到留空）。
- 头部：标题 + 数量徽标 + 折叠；空态保留占位；无搜索。

**双区关系（设置页可选）**
- `重复展示`（默认）：会话同时出现在活跃区和项目区。
- `选中后回到项目区`：在活跃区点开会话后从活跃区移出（项目区保留），直到该会话有新消息才重新进入；移除记录跨刷新持久化，设置页可一键重置。

**项目区（下段）**
- 按状态优先排序的工作区分组列表（workspace 行取组内最高态，会话按 需介入 → 执行中 → 已完成）。
- 未归组会话行、搜索、分组折叠、已完成预览限量展开、会话/工作区归档与恢复、工作区重命名与按路径添加。

**设置**
- 设置页新增独立 tab「工作区状态卡」：活跃时间窗口（默认 3 天）、展示模式（重复/回项目区）、重置活跃区。

## 安装

```bash
# 在 DSH profile 中以本地包方式安装（示例路径按实际 profile 调整）
cd ~/.dsh/profiles/desktop
npm install --save "file:/Users/xavier/Documents/proj/dsh-workspace-statuscard"
```

并在 profile 的 `cordis.patch.yml` 中加入：

```yaml
- insert:
    - id: workspace-statuscard
      name: '@local/dsh-workspace-statuscard'
```

重启 DSH 生效。

## 结构

- `index.js` — Host 侧空 `apply()`（纯浏览器 UI，无模型面）。
- `client.js` — 客户端主体：抢槽、数据派生、活跃区/项目区组件、设置 store。
- `cordis.patch.yml` — bundle patch，仅一行 insert 注册。
- `locale/zh.json`、`locale/en.json` — 插件详情页文案（运行时字典内联在 client.js）。

## 与旧版 status-board 的关系

参考其骨架（抢槽/状态映射/排序/相对时间/localStorage），按新设计重写；移除了更新弹窗、secret 占位符、同状态拖拽与自动排序；新增活跃区、双模式、设置 tab、悬停摘要。
