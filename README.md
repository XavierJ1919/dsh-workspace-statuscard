# dsh-workspace-statuscard

**DSH（DeepSeek Harness）工作区侧栏增强插件**：在官方工作区列表上方常驻一块「活跃会话区」，按会话（而非项目）维度展示最近活跃的会话，并把需要你介入的会话置顶。

![License](https://img.shields.io/badge/License-MIT-green) ![Version](https://img.shields.io/github/v/tag/XavierJ1919/dsh-workspace-statuscard?sort=semver&label=release) ![DSH](https://img.shields.io/badge/DSH-%3E%3D0.2.2--rc.1-blue) ![Platform](https://img.shields.io/badge/platform-web-lightgrey)

简体中文 | [English](./README.en.md)

## 这是什么

DSH（DeepSeek Harness）的 Web 侧栏默认按「工作区/项目」组织会话；本插件把同一位置改为**活跃会话优先**：一块常驻的活跃区在上，官方风格的工作区分组列表在下，两段渲染在同一个组件里。

- dsh-workspace-statuscard 是一个开源（MIT）的 DSH bundle 插件，纯浏览器端 UI，无 Host/模型侧改动。
- 它以 `priority: -1` 抢占侧栏 `sidebar.workspaces` single slot 完成整体重渲染；在 DSH 中禁用本插件后，官方 WorkspaceBrowser 自动恢复，不残留任何修改。
- 会话状态、相对时间、消息预览均为客户端只读投影（如懒加载 `turnOutline`），不写入会话数据。

## 功能

### 活跃区（上段）

- **筛选**：仅展示最近 N 天内有过活动的会话（默认 3 天，设置页可改），归档/子代理/空白会话不进入。
- **排序**：需要介入 → 执行中 → 已完成（"最近完成"分组靠后），组内按最后活动时间倒序；单纯打开会话不刷新活跃时间。
- **卡片**：会话标题、归属项目（彩色缩写头像 + 项目名）、状态徽章、相对时间、完成未读绿点。
- **悬停展开**：项目路径、最近活动绝对时间、最近消息预览（懒加载 `turnOutline` 投影，取不到留空）。
- **头部**：标题 + 数量徽标 + 折叠；空态保留占位；无搜索。

### 双区关系（设置页可选）

| 模式 | 行为 |
|---|---|
| 重复展示（默认） | 会话同时出现在活跃区和项目区 |
| 选中后回到项目区 | 在活跃区点开会话后从活跃区移出（项目区保留），直到该会话有新消息才重新进入；移除记录跨刷新持久化，设置页可一键重置 |

### 项目区（下段）

- 按状态优先排序的工作区分组列表（workspace 行取组内最高态，会话按 需介入 → 执行中 → 已完成）。
- 未归组会话行、搜索、分组折叠、已完成预览限量展开、会话/工作区归档与恢复、工作区重命名与按路径添加。

### 设置

设置页新增独立 tab「工作区状态卡」：

- **活跃时间窗口**：仅最近 N 天内有过活动的会话进入活跃区（默认 3 天）。
- **展示模式**：重复展示 / 选中后回到项目区。
- **重置活跃区**：清空"选中后回到项目区"的移除记录。
- **字号**：基准字号 11–16px 步进调节，其余元素等比缩放。

## 截图

<!-- TODO: 从 DSH 截图后替换占位符；建议 3 张：①侧栏全景（活跃区+项目区） ②悬停展开的消息预览卡片 ③设置页「工作区状态卡」tab -->

## 安装

### 方式一：克隆仓库安装（推荐）

```bash
git clone https://github.com/XavierJ1919/dsh-workspace-statuscard.git
cd ~/.dsh/profiles/desktop   # 按实际 profile 路径调整
npm install --save "file:/path/to/dsh-workspace-statuscard"
```

### 方式二：已有本地路径直接安装

```bash
cd ~/.dsh/profiles/desktop
npm install --save "file:/Users/xavier/Documents/proj/dsh-workspace-statuscard"
```

### 注册 bundle patch

在 profile 的 `cordis.patch.yml` 中加入：

```yaml
- insert:
    - id: workspace-statuscard
      name: '@local/dsh-workspace-statuscard'
```

重启 DSH 生效。

## 结构

| 文件 | 说明 |
|---|---|
| `index.js` | Host 侧空 `apply()`（纯浏览器 UI，无模型面） |
| `client.js` | 客户端主体：抢槽、数据派生、活跃区/项目区组件、设置 store |
| `cordis.patch.yml` | bundle patch，仅一行 insert 注册 |
| `locale/zh.json`、`locale/en.json` | 插件详情页文案（运行时字典内联在 client.js） |

## 与旧版 status-board 的关系

| 类别 | 内容 |
|---|---|
| 参考复用 | 抢槽、状态映射、排序、相对时间、localStorage 骨架 |
| 移除 | 更新弹窗、secret 占位符、同状态拖拽与自动排序 |
| 新增 | 活跃区、双展示模式、设置 tab、悬停摘要、字号设置 |

## FAQ

### 会不会破坏官方工作区列表？

不会。插件只是抢占 `sidebar.workspaces` 这一 single slot 重新渲染；在 DSH 中禁用本插件后，官方 WorkspaceBrowser 自动恢复。

### 是纯前端插件吗？会改动会话数据吗？

是纯浏览器端 UI。Host 侧 `index.js` 为空 `apply()`；会话状态与预览都是客户端只读派生，不写回任何会话数据。

### 支持哪些 DSH 版本？

`engines.dsh >= 0.2.2-rc.1`（见 `package.json`）。

### 怎样让点开过的会话从活跃区消失？

设置页把展示模式切换为「选中后回到项目区」；想清空移除记录用「重置活跃区」。

### "需要介入"是怎么判定的？

会话存在待处理项（如等待审批、计划待审、待回答问题）即标记为需要介入，并置顶在活跃区。

## License

[MIT](./LICENSE)
