/*
 * Workspace statuscard — Client half.
 *
 * Registers at priority -1 into the sidebar's `sidebar.workspaces` single slot,
 * shadowing the shipped WorkspaceBrowser, and renders two zones in one column:
 *
 *   1. Active zone (top): sessions active within a configurable window,
 *      sorted needs-input → running → done, each card labeled with its
 *      owning workspace, state badge, relative time and a hover detail block.
 *   2. Workspace zone (bottom): status-first grouped browser (workspaces and
 *      their sessions, ungrouped strays, archive/restore, search).
 *
 * Display modes (settings tab):
 *   a. duplicate — sessions appear in both zones (default)
 *   b. return    — opening a session in the active zone removes it there until
 *                  the session sees new activity (dismissal persisted)
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-workspace-statuscard',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'workspaceStatuscard'
    const STATES = ['attention', 'running', 'done']
    const RANK = { attention: 0, running: 1, done: 2 }
    const PENDING_KINDS = { approval: 'pending.approval', 'plan-review': 'pending.plan', question: 'pending.question' }
    const PENDING_KINDS_FULL = { approval: 'pending.approval.full', 'plan-review': 'pending.plan.full', question: 'pending.question.full' }
    const DONE_PREVIEW_LIMIT = 3
    const EMPTY_MAP = new Map()
    const EMPTY_SESSIONS = { phase: 'ready', ids: [], byId: {}, projectionsBySession: {} }

    const COLLAPSE_KEY = 'dsh.workspace-status-board.collapsed.v1'
    const ARCHIVED_WORKSPACES_KEY = 'dsh.workspace-status-board.archived-workspaces.v1'
    const SETTINGS_KEY = 'dsh.workspace-statuscard.settings.v1'
    const DISMISS_KEY = 'dsh.workspace-statuscard.dismissed.v1'
    const ACTIVE_COLLAPSE_KEY = 'dsh.workspace-statuscard.active-collapsed.v1'
    const DEFAULT_SETTINGS = { windowDays: 3, mode: 'a' }
    const DAY_MS = 86400000

    // ---------------------------------------------------------------------
    // Settings store (module scope: the sidebar zone and the settings tab
    // render in the same document and must observe the same values)
    // ---------------------------------------------------------------------

    const settingsListeners = new Set()
    let settingsCache = null

    function sanitizeSettings(value) {
      const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
      const windowDays = Number(source.windowDays)
      return {
        windowDays: Number.isFinite(windowDays) && windowDays > 0 ? windowDays : DEFAULT_SETTINGS.windowDays,
        mode: source.mode === 'b' ? 'b' : 'a',
      }
    }

    function getSettings() {
      if (settingsCache === null) settingsCache = sanitizeSettings(readStoredMap(SETTINGS_KEY))
      return settingsCache
    }

    function writeSettings(patch) {
      const next = sanitizeSettings(Object.assign({}, getSettings(), patch))
      settingsCache = next
      writeStoredMap(SETTINGS_KEY, next)
      for (const listener of settingsListeners) listener(next)
      return next
    }

    function subscribeSettings(listener) {
      settingsListeners.add(listener)
      return () => settingsListeners.delete(listener)
    }

    function useSettings() {
      const [value, setValue] = React.useState(getSettings)
      React.useEffect(() => subscribeSettings(setValue), [])
      return [value, writeSettings]
    }

    // ---------------------------------------------------------------------
    // Locale
    // ---------------------------------------------------------------------

    const en = {
      'title': 'Workspaces',
      'title.rail': 'Workspace status',
      'active.title': 'Active sessions',
      'active.empty': 'No active sessions',
      'active.recentDone': 'Recently done',
      'active.count': '{n} active',
      'active.expand': 'Expand active sessions',
      'active.collapse': 'Collapse active sessions',
      'state.attention': 'Needs input',
      'state.running': 'Running',
      'state.done': 'Done',
      'pending.approval': 'Approval',
      'pending.plan': 'Plan review',
      'pending.question': 'Answer',
      'pending.approval.full': 'Waiting for approval',
      'pending.plan.full': 'Plan awaiting review',
      'pending.question.full': 'Waiting for answer',
      'running.children': 'Subagents {n}',
      'tasks.none': 'No tasks yet',
      'tasks.one': '1 task',
      'tasks.other': '{n} tasks',
      'active.at': 'Active {time}',
      'newSession': 'New session in {name}',
      'addWorkspace': 'Add workspace',
      'addWorkspace.error': 'Could not add workspace: {message}',
      'addWorkspace.pathTitle': 'Add workspace by path',
      'addWorkspace.pathPlaceholder': 'Absolute directory path',
      'addWorkspace.pathHint': 'The native folder picker is unavailable here. Enter an absolute directory path.',
      'addWorkspace.add': 'Add',
      'addWorkspace.cancel': 'Cancel',
      'search.label': 'Search workspaces and tasks',
      'search.placeholder': 'Search workspaces or tasks',
      'search.clear': 'Clear search',
      'search.empty': 'No matching workspaces or tasks',
      'search.hint': 'Search by workspace name, path, or task title.',
      'total': '{n} workspaces',
      'total.results': '{n} results',
      'done.more': '{n} more done',
      'done.less': 'Show less',
      'archive.action': 'Archive task',
      'archive.confirm': '"{name}" still has running work. Stop it and archive?',
      'archive.stop': 'Stop and archive',
      'archive.cancel': 'Cancel',
      'archive.error': 'Could not archive: {message}',
      'archived.title': 'Archived ({n})',
      'archiveWorkspace.action': 'Archive workspace',
      'archivedWorkspaces.title': 'Archived workspaces ({n})',
      'archived.restore': 'Restore',
      'archived.restoreError': 'Could not restore: {message}',
      'rename.action': 'Rename workspace',
      'rename.title': 'Rename workspace',
      'rename.placeholder': 'Workspace name',
      'rename.save': 'Save',
      'rename.cancel': 'Cancel',
      'rename.error': 'Could not rename: {message}',
      'renameTask.action': 'Rename task',
      'renameTask.title': 'Rename task',
      'renameTask.placeholder': 'Task title',
      'renameTask.error': 'Could not rename task: {message}',
      'expand': 'Expand {name}',
      'collapse': 'Collapse {name}',
      'ungrouped': 'Ungrouped',
      'loading': 'Loading workspaces…',
      'empty.title': 'No workspaces yet',
      'empty.hint': 'Add a folder to start a workspace.',
      'time.now': 'just now',
      'time.unknown': 'no activity yet',
      'time.minutes': '{n} min ago',
      'time.hours': '{n} h ago',
      'time.days': '{n} d ago',
      'untitled': 'Untitled workspace',
      'unnamedSession': 'Untitled session',
      'current': 'Open now',
      'details.path': 'Workspace path',
      'details.active': 'Last active',
      'details.message': 'Last message',
      'details.noMessage': 'No message preview',
      'settings.title': 'Workspace statuscard',
      'settings.hint': 'Active zone display and filtering.',
      'settings.window': 'Activity window',
      'settings.windowHint': 'Only sessions active within the last N days appear in the active zone.',
      'settings.windowUnit': 'days',
      'settings.mode': 'Display mode',
      'settings.modeA': 'Duplicate',
      'settings.modeADesc': 'Sessions appear in both the active zone and the workspace list (default).',
      'settings.modeB': 'Return to workspace on open',
      'settings.modeBDesc': 'Opening a session in the active zone removes it there until it sees new activity.',
      'settings.reset': 'Reset active zone',
      'settings.resetHint': 'Clear every dismissal record so sessions re-enter the active zone by the rules.',
      'settings.resetDone': 'Reset done',
      'settings.window.invalid': 'Enter a number of days greater than 0',
    }

    const zh = {
      'title': '工作区',
      'title.rail': '工作区状态',
      'active.title': '活跃会话',
      'active.empty': '暂无活跃会话',
      'active.recentDone': '最近完成',
      'active.count': '{n} 个活跃',
      'active.expand': '展开活跃会话',
      'active.collapse': '收起活跃会话',
      'state.attention': '需要介入',
      'state.running': '执行中',
      'state.done': '已完成',
      'pending.approval': '待批准',
      'pending.plan': '待确认计划',
      'pending.question': '待回答',
      'pending.approval.full': '等待批准',
      'pending.plan.full': '计划等待确认',
      'pending.question.full': '等待回答',
      'running.children': '子任务 {n}',
      'tasks.none': '暂无任务',
      'tasks.one': '1 个任务',
      'tasks.other': '{n} 个任务',
      'active.at': '最近活动 {time}',
      'newSession': '在 {name} 中新建会话',
      'addWorkspace': '添加工作区',
      'addWorkspace.error': '无法添加工作区：{message}',
      'addWorkspace.pathTitle': '按路径添加工作区',
      'addWorkspace.pathPlaceholder': '绝对目录路径',
      'addWorkspace.pathHint': '当前环境没有原生文件夹选择器，请直接输入绝对目录路径。',
      'addWorkspace.add': '添加',
      'addWorkspace.cancel': '取消',
      'search.label': '搜索工作区与任务',
      'search.placeholder': '搜索工作区或任务',
      'search.clear': '清除搜索',
      'search.empty': '没有匹配的工作区或任务',
      'search.hint': '可搜索工作区名称、路径或任务标题。',
      'total': '{n} 个工作区',
      'total.results': '{n} 个结果',
      'done.more': '另外 {n} 个已完成',
      'done.less': '收起已完成',
      'archive.action': '归档任务',
      'archive.confirm': '“{name}”仍有正在执行的工作。停止并归档？',
      'archive.stop': '停止并归档',
      'archive.cancel': '取消',
      'archive.error': '归档失败：{message}',
      'archived.title': '已归档（{n}）',
      'archiveWorkspace.action': '归档工作区',
      'archivedWorkspaces.title': '已归档工作区（{n}）',
      'archived.restore': '恢复',
      'archived.restoreError': '恢复失败：{message}',
      'rename.action': '重命名工作区',
      'rename.title': '重命名工作区',
      'rename.placeholder': '工作区名称',
      'rename.save': '保存',
      'rename.cancel': '取消',
      'rename.error': '重命名失败：{message}',
      'renameTask.action': '重命名任务',
      'renameTask.title': '重命名任务',
      'renameTask.placeholder': '任务标题',
      'renameTask.error': '任务重命名失败：{message}',
      'expand': '展开 {name}',
      'collapse': '收起 {name}',
      'ungrouped': '未归组',
      'loading': '正在载入工作区…',
      'empty.title': '还没有工作区',
      'empty.hint': '添加一个文件夹即可开始。',
      'time.now': '刚刚',
      'time.unknown': '暂无活动',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'time.days': '{n} 天前',
      'untitled': '未命名工作区',
      'unnamedSession': '未命名会话',
      'current': '当前打开',
      'details.path': '项目路径',
      'details.active': '最近活动',
      'details.message': '最近消息',
      'details.noMessage': '暂无消息预览',
      'settings.title': '工作区状态卡',
      'settings.hint': '活跃区展示与筛选方式。',
      'settings.window': '活跃时间窗口',
      'settings.windowHint': '仅最近 N 天内有过活动的会话会进入活跃区。',
      'settings.windowUnit': '天',
      'settings.mode': '展示模式',
      'settings.modeA': '重复展示',
      'settings.modeADesc': '会话同时出现在活跃区和项目区（默认）。',
      'settings.modeB': '选中后回到项目区',
      'settings.modeBDesc': '会话在活跃区被打开后移出，直到有新消息才重新进入。',
      'settings.reset': '重置活跃区',
      'settings.resetHint': '清除全部“已移出”记录，会话按规则重新进入活跃区。',
      'settings.resetDone': '已重置',
      'settings.window.invalid': '请输入大于 0 的天数',
    }

    // ---------------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------------

    const CSS = [
      '.wsc-root{--wsc-accent:var(--dsw-alias-state-success-primary,#3fb950);display:flex;flex-direction:column;height:100%;min-height:0;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.4}',
      '.wsc-root *,.wsc-root *::before,.wsc-root *::after{box-sizing:border-box}',
      '.wsc-root [data-state="attention"]{--wsc-accent:var(--dsw-alias-state-warn-primary,#d99a2b)}',
      '.wsc-root [data-state="running"]{--wsc-accent:var(--dsw-alias-brand-primary,#4c8df6)}',
      '.wsc-root [data-state="done"]{--wsc-accent:var(--dsw-alias-state-success-primary,#3fb950)}',
      '.wsc-root :focus-visible,.wsc-settings-root :focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c8df6);outline-offset:1px}',
      '.wsc-visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
      '.wsc-head{display:flex;flex-direction:column;gap:6px;padding:8px 8px 6px}',
      '.wsc-head-row{display:flex;align-items:center;gap:6px;min-height:22px}',
      '.wsc-title{flex:1;min-width:0;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}',
      '.wsc-total{flex:none;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.wsc-add{flex:none;width:22px;height:22px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}',
      '.wsc-add:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.wsc-add:disabled{opacity:.5;cursor:default}',
      '.wsc-search{display:flex;align-items:center;gap:6px;height:28px;padding:0 8px;border:1px solid transparent;border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.wsc-search:focus-within{border-color:var(--dsw-alias-brand-primary,#4c8df6);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.wsc-search-icon{flex:none;display:inline-flex;align-items:center;justify-content:center}',
      '.wsc-search-input{flex:1;min-width:0;border:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.4;padding:0;outline:none;appearance:none}',
      '.wsc-search-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.85}',
      '.wsc-search-input::-webkit-search-cancel-button{display:none}',
      '.wsc-search-clear{flex:none;width:18px;height:18px;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}',
      '.wsc-search-clear:hover{background:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}',
      '.wsc-summary{display:flex;align-items:center;gap:5px;flex-wrap:wrap}',
      '.wsc-chip{display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--wsc-accent);font-size:10.5px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.wsc-chip[data-zero="true"]{opacity:.45}',
      '.wsc-error{margin:0 8px 4px;padding:5px 7px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 12%,transparent);color:var(--dsw-alias-state-error-primary,#e5484d);font-size:11px;line-height:1.4;overflow-wrap:anywhere}',
      '.wsc-active{margin:2px 6px 4px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 45%,transparent);flex:none}',
      '.wsc-active[data-collapsed="true"]{padding-bottom:0}',
      '.wsc-active-head{display:flex;align-items:center;gap:5px;min-height:30px;padding:3px 4px;border-radius:9px}',
      '.wsc-active-head:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsc-active-toggle{flex:1;min-width:0;display:flex;align-items:center;gap:5px;padding:3px 2px;border:none;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.wsc-active-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}',
      '.wsc-active-count{flex:none;display:inline-flex;align-items:center;min-width:17px;height:15px;padding:0 5px;border-radius:8px;background:color-mix(in srgb,var(--wsc-accent) 16%,transparent);color:var(--wsc-accent);font-size:9.5px;font-weight:700;font-variant-numeric:tabular-nums;justify-content:center}',
      '.wsc-chevron{flex:none;display:inline-flex;color:var(--dsw-alias-label-secondary);transition:transform .15s ease}',
      '.wsc-active-toggle[aria-expanded="false"] .wsc-chevron,.wsc-toggle[aria-expanded="false"] .wsc-chevron{transform:rotate(-90deg)}',
      '.wsc-cards{display:flex;flex-direction:column;gap:2px;padding:2px 3px 5px}',
      '.wsc-card{--wsc-card-accent:var(--wsc-accent);position:relative;display:flex;flex-direction:column;border-radius:8px;padding:5px 7px;color:inherit;font:inherit;text-align:left;border:none;background:transparent;cursor:pointer;width:100%}',
      '.wsc-card[data-state="attention"]{--wsc-card-accent:var(--dsw-alias-state-warn-primary,#d99a2b);background:color-mix(in srgb,var(--wsc-card-accent) 8%,transparent)}',
      '.wsc-card[data-state="running"]{--wsc-card-accent:var(--dsw-alias-brand-primary,#4c8df6)}',
      '.wsc-card[data-state="done"]{--wsc-card-accent:var(--dsw-alias-state-success-primary,#3fb950)}',
      '.wsc-card:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsc-card[data-state="attention"]:hover{background:color-mix(in srgb,var(--wsc-card-accent) 14%,transparent)}',
      '.wsc-card[data-current="true"]{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 2px 0 0 var(--wsc-card-accent)}',
      '.wsc-card-row1{display:flex;align-items:center;gap:6px;min-width:0}',
      '.wsc-card-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;color:var(--wsc-card-accent)}',
      '.wsc-card-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}',
      '.wsc-card[data-current="true"] .wsc-card-title{font-weight:600}',
      '.wsc-card-time{flex:none;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.wsc-card[data-state="attention"] .wsc-card-time{color:var(--wsc-card-accent);font-weight:600}',
      '.wsc-card-row2{display:flex;align-items:center;gap:5px;margin-top:3px;min-width:0}',
      '.wsc-avatar{flex:none;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:4px;color:#fff;font-size:8px;font-weight:700;line-height:1;letter-spacing:.02em;user-select:none}',
      '.wsc-ws-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
      '.wsc-badge{flex:none;display:inline-flex;align-items:center;gap:3px;height:16px;padding:0 6px;border-radius:999px;font-size:10px;font-weight:600;white-space:nowrap;color:var(--wsc-card-accent);background:color-mix(in srgb,var(--wsc-card-accent) 13%,transparent);border:1px solid color-mix(in srgb,var(--wsc-card-accent) 38%,transparent)}',
      '.wsc-unread-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#3fb950)}',
      '.wsc-tip{position:fixed;z-index:2147483000;width:300px;max-height:60vh;overflow:hidden;padding:9px 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 12px 40px rgba(0,0,0,.28);font-size:11px;line-height:1.5;pointer-events:none}',
      '.wsc-tip-title{display:flex;align-items:center;gap:6px;margin-bottom:5px;min-width:0}',
      '.wsc-tip-title-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600}',
      '.wsc-tip-rows{display:flex;flex-direction:column;gap:3px;min-width:0}',
      '.wsc-detail-row{display:flex;gap:5px;min-width:0}',
      '.wsc-detail-label{flex:none;opacity:.75}',
      '.wsc-detail-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}',
      '.wsc-detail-message{white-space:pre-line;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;color:var(--dsw-alias-label-primary)}',
      '.wsc-active-empty{display:flex;align-items:center;justify-content:center;min-height:44px;margin:2px 3px 5px;border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
      '.wsc-zone-head{display:flex;align-items:center;gap:6px;min-height:28px;margin:4px 4px 0;padding:5px 4px 3px;border-top:1px solid var(--dsw-alias-border-l2)}',
      '.wsc-divider{display:flex;align-items:center;gap:6px;margin:5px 2px 3px;font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}',
      '.wsc-divider::after{content:"";flex:1;height:1px;background:var(--dsw-alias-border-l1)}',
      '.wsc-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:2px 6px 12px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}',
      '.wsc-scroll::-webkit-scrollbar{width:6px}',
      '.wsc-scroll::-webkit-scrollbar-thumb{border-radius:3px;background:var(--dsw-alias-border-l2)}',
      '.wsc-scroll::-webkit-scrollbar-track{background:transparent}',
      '.wsc-group{margin:2px 0;border-radius:8px;min-width:0}',
      '.wsc-group-head{display:flex;align-items:center;gap:3px;min-height:30px;padding:3px 3px 3px 4px;border-radius:8px;box-shadow:inset 2px 0 0 var(--wsc-accent);background:transparent}',
      '.wsc-group[data-state="attention"] .wsc-group-head{background:color-mix(in srgb,var(--wsc-accent) 10%,transparent)}',
      '.wsc-group-head:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsc-group[data-state="attention"] .wsc-group-head:hover{background:color-mix(in srgb,var(--wsc-accent) 16%,transparent)}',
      '.wsc-toggle{flex:1;min-width:0;display:flex;align-items:center;gap:5px;padding:3px 2px;border:none;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.wsc-ws-avatar{flex:none}',
      '.wsc-ws-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500}',
      '.wsc-pill{flex:none;display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 6px;border-radius:999px;font-size:10.5px;font-weight:600;white-space:nowrap;color:var(--wsc-accent);border:1px solid color-mix(in srgb,var(--wsc-accent) 38%,transparent);background:color-mix(in srgb,var(--wsc-accent) 13%,transparent)}',
      '.wsc-new,.wsc-ws-archive,.wsc-rename-action{flex:none;width:22px;height:22px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;opacity:0}',
      '.wsc-group:hover .wsc-new,.wsc-group:hover .wsc-ws-archive,.wsc-group:hover .wsc-rename-action,.wsc-new:focus-visible,.wsc-ws-archive:focus-visible,.wsc-rename-action:focus-visible{opacity:1}',
      '.wsc-new:hover,.wsc-ws-archive:hover,.wsc-rename-action:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '@media (hover:none){.wsc-new,.wsc-ws-archive,.wsc-rename-action{opacity:1}}',
      '.wsc-rename{display:flex;align-items:center;gap:5px;padding:2px 6px 5px 24px}',
      '.wsc-rename-session{padding-left:39px}',
      '.wsc-rename-input{flex:1;min-width:0;height:26px;padding:0 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none}',
      '.wsc-rename-input:focus{border-color:var(--dsw-alias-brand-primary,#4c8df6)}',
      '.wsc-rename-input::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.wsc-rename-save,.wsc-rename-cancel{flex:none;height:26px;padding:0 8px;border-radius:6px;font:inherit;font-size:11px;cursor:pointer}',
      '.wsc-rename-save{border:none;background:var(--dsw-alias-brand-primary,#4c8df6);color:#fff}',
      '.wsc-rename-save:disabled{opacity:.5;cursor:default}',
      '.wsc-rename-cancel{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}',
      '.wsc-rename-cancel:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsc-add-path{display:flex;flex-direction:column;gap:4px;margin:0 8px 6px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-2)}',
      '.wsc-add-path-row{display:flex;align-items:center;gap:5px}',
      '.wsc-add-path-input{flex:1;min-width:0;height:26px;padding:0 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none}',
      '.wsc-add-path-input:focus{border-color:var(--dsw-alias-brand-primary,#4c8df6)}',
      '.wsc-add-path-hint{font-size:10px;line-height:1.4;color:var(--dsw-alias-label-secondary)}',
      '.wsc-sessions{display:flex;flex-direction:column;gap:1px;padding:0 2px 3px}',
      '.wsc-session{display:flex;align-items:center;width:100%;min-height:26px;border-radius:6px;background:transparent;color:inherit}',
      '.wsc-session:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsc-session[data-state="attention"]{background:color-mix(in srgb,var(--wsc-accent) 7%,transparent)}',
      '.wsc-session[data-state="attention"]:hover{background:color-mix(in srgb,var(--wsc-accent) 13%,transparent)}',
      '.wsc-session[data-current="true"]{background:var(--dsw-alias-bg-layer-2)}',
      '.wsc-session-main{flex:1;min-width:0;display:flex;align-items:center;gap:7px;padding:4px 2px;border:none;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.wsc-session-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;color:var(--wsc-accent)}',
      '.wsc-session-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}',
      '.wsc-session[data-current="true"] .wsc-session-title{font-weight:600}',
      '.wsc-session-tail{flex:none;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.wsc-session[data-state="attention"] .wsc-session-tail{color:var(--wsc-accent);font-weight:600}',
      '.wsc-session[data-state="running"] .wsc-session-tail{color:var(--wsc-accent)}',
      '.wsc-session-rename,.wsc-session-archive{flex:none;width:22px;height:22px;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;padding:0}',
      '.wsc-session-archive{margin-right:2px}',
      '.wsc-session:hover .wsc-session-rename,.wsc-session:hover .wsc-session-archive,.wsc-session-rename:focus-visible,.wsc-session-archive:focus-visible{opacity:.9}',
      '.wsc-session-rename:hover,.wsc-session-archive:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);opacity:1}',
      '@media (hover:none){.wsc-session-rename,.wsc-session-archive{opacity:.65}}',
      '.wsc-more{display:flex;align-items:center;gap:4px;width:100%;padding:3px 7px 3px 24px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;text-align:left;cursor:pointer}',
      '.wsc-more:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.wsc-more .wsc-chevron{width:10px;height:10px}',
      '.wsc-confirm{margin:0 8px 6px;padding:7px 8px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d99a2b) 35%,transparent);border-radius:7px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d99a2b) 10%,transparent);color:var(--dsw-alias-label-primary);font-size:11px;line-height:1.45;display:flex;flex-direction:column;gap:6px}',
      '.wsc-confirm-text{overflow-wrap:anywhere}',
      '.wsc-confirm-actions{display:flex;gap:6px}',
      '.wsc-confirm-primary,.wsc-confirm-secondary,.wsc-settings-reset{padding:3px 9px;border-radius:6px;font:inherit;font-size:11px;cursor:pointer}',
      '.wsc-confirm-primary{border:none;background:var(--dsw-alias-brand-primary,#4c8df6);color:#fff}',
      '.wsc-confirm-secondary,.wsc-settings-reset{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}',
      '.wsc-confirm-secondary:hover,.wsc-settings-reset:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsc-confirm-primary:disabled,.wsc-confirm-secondary:disabled{opacity:.55;cursor:default}',
      '.wsc-archived{margin:6px 0 2px;padding-top:4px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.wsc-archived-head{display:flex;align-items:center;gap:5px;width:100%;padding:4px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;text-align:left;cursor:pointer}',
      '.wsc-archived-head:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.wsc-archived-list{display:flex;flex-direction:column;gap:1px;padding:0 2px}',
      '.wsc-archived-row{display:flex;align-items:center;gap:7px;min-height:26px;padding:3px 6px 3px 10px;border-radius:6px}',
      '.wsc-archived-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsc-archived-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;color:var(--dsw-alias-label-secondary)}',
      '.wsc-archived-text{flex:1;min-width:0;display:flex;flex-direction:column}',
      '.wsc-archived-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.wsc-archived-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.wsc-restore{flex:none;padding:2px 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:10.5px;cursor:pointer}',
      '.wsc-restore:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.wsc-restore:disabled{opacity:.55;cursor:default}',
      '.wsc-none{padding:2px 8px 6px 25px;font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
      '.wsc-empty{display:flex;flex-direction:column;align-items:center;gap:4px;padding:26px 12px;text-align:center;color:var(--dsw-alias-label-secondary)}',
      '.wsc-empty-title{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.wsc-empty-icon{display:inline-flex;color:var(--dsw-alias-label-secondary);margin-bottom:2px}',
      '.wsc-empty-hint{font-size:11px;line-height:1.5}',
      '.wsc-empty-action{margin-top:8px;padding:4px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;cursor:pointer}',
      '.wsc-empty-action:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsc-rail{display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;padding:8px 0}',
      '.wsc-rail-btn{position:relative;width:36px;height:36px;border:none;border-radius:10px;background:transparent;color:var(--wsc-accent);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}',
      '.wsc-rail-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsc-rail-btn[data-zero="true"]{opacity:.42}',
      '.wsc-rail-count{position:absolute;right:3px;bottom:2px;min-width:13px;height:13px;padding:0 2px;border-radius:7px;background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base));color:var(--wsc-accent);font-size:9px;font-weight:700;line-height:13px;text-align:center;font-variant-numeric:tabular-nums}',
      '.wsc-spin{animation:wsc-rotate 1.15s linear infinite;transform-origin:50% 50%}',
      '@keyframes wsc-rotate{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion:reduce){.wsc-spin{animation:none}.wsc-chevron{transition:none}}',
      '.wsc-settings-root{display:flex;flex-direction:column;gap:14px;max-width:560px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}',
      '.wsc-settings-row{display:flex;flex-direction:column;gap:4px}',
      '.wsc-settings-label{font-weight:600;font-size:13px}',
      '.wsc-settings-desc{font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.wsc-settings-window{display:flex;align-items:center;gap:7px}',
      '.wsc-settings-input{width:88px;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none}',
      '.wsc-settings-input:focus{border-color:var(--dsw-alias-brand-primary,#4c8df6)}',
      '.wsc-settings-unit{font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.wsc-settings-invalid{font-size:11px;color:var(--dsw-alias-state-error-primary,#e5484d)}',
      '.wsc-settings-modes{display:flex;flex-direction:column;gap:6px}',
      '.wsc-mode{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.wsc-mode:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.wsc-mode[data-checked="true"]{border-color:var(--dsw-alias-brand-primary,#4c8df6);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4c8df6) 8%,transparent)}',
      '.wsc-mode-name{display:flex;align-items:center;gap:7px;font-weight:600;font-size:12.5px}',
      '.wsc-mode-dot{flex:none;width:12px;height:12px;border-radius:50%;border:2px solid var(--dsw-alias-border-l2)}',
      '.wsc-mode[data-checked="true"] .wsc-mode-dot{border-color:var(--dsw-alias-brand-primary,#4c8df6);background:var(--dsw-alias-brand-primary,#4c8df6);box-shadow:inset 0 0 0 2px var(--dsw-alias-bg-base,#fff)}',
      '.wsc-mode-desc{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.wsc-settings-saved{font-size:11px;color:var(--dsw-alias-state-success-primary,#3fb950)}',
      '.wsc-settings-reset-row{display:flex;align-items:center;gap:8px}',
      '.wsc-settings-reset:disabled{opacity:.55;cursor:default}',
    ].join('\n')

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    function readStoredMap(key) {
      try {
        const raw = localStorage.getItem(key)
        if (raw === null) return {}
        const parsed = JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch {
        return {}
      }
    }

    function writeStoredMap(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        /* localStorage may be unavailable in a sandboxed frame */
      }
    }

    function readCollapsedMap() {
      return readStoredMap(COLLAPSE_KEY)
    }

    function readArchivedWorkspaces() {
      return readStoredMap(ARCHIVED_WORKSPACES_KEY)
    }

    function readDismissals() {
      const raw = readStoredMap(DISMISS_KEY)
      const out = {}
      for (const [id, at] of Object.entries(raw)) {
        if (typeof at === 'number' && Number.isFinite(at) && at > 0) out[id] = at
      }
      return out
    }

    function writeDismissals(value) {
      writeStoredMap(DISMISS_KEY, value)
    }

    function readActiveCollapsed() {
      const raw = readStoredMap(ACTIVE_COLLAPSE_KEY)
      return raw.collapsed === true
    }

    function writeActiveCollapsed(collapsed) {
      writeStoredMap(ACTIVE_COLLAPSE_KEY, { collapsed: collapsed === true })
    }

    // Dismissal records are shared between the sidebar zone (mode b opens) and
    // the settings tab (reset), so they ride a module-scope store like settings.
    const dismissListeners = new Set()
    let dismissCache = null

    function getDismissals() {
      if (dismissCache === null) dismissCache = readDismissals()
      return dismissCache
    }

    function commitDismissals(patch) {
      const next = typeof patch === 'function' ? patch(getDismissals()) : patch
      dismissCache = next
      writeDismissals(next)
      for (const listener of dismissListeners) listener(next)
      return next
    }

    function subscribeDismissals(listener) {
      dismissListeners.add(listener)
      return () => dismissListeners.delete(listener)
    }

    function useDismissals() {
      const [value, setValue] = React.useState(getDismissals)
      React.useEffect(() => subscribeDismissals(setValue), [])
      return [value, commitDismissals]
    }

    // ---------------------------------------------------------------------
    // Pure derivation — sessions and workspaces
    // ---------------------------------------------------------------------

    function pendingKindOf(status) {
      const kind = status !== undefined && status !== null && status.pendingInteraction !== undefined && status.pendingInteraction !== null
        ? status.pendingInteraction.kind
        : undefined
      return kind === 'approval' || kind === 'plan-review' || kind === 'question' ? kind : null
    }

    function basenameOf(path) {
      if (typeof path !== 'string' || path.length === 0) return ''
      const trimmed = path.replace(/[/\\]+$/, '')
      const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
      return trimmed.slice(cut + 1)
    }

    function sessionTitleOf(summary) {
      const title = typeof summary.title === 'string' ? summary.title.trim() : ''
      if (title.length > 0) return title
      const display = typeof summary.displayTitle === 'string' ? summary.displayTitle.trim() : ''
      return display.length > 0 ? display : ''
    }

    function runningChildCount(list, parentId, statuses) {
      const catalog = list !== undefined && list !== null && list.projectionsBySession !== undefined
        ? list.projectionsBySession[parentId]
        : undefined
      const children = catalog !== undefined && catalog !== null && catalog.values !== undefined
        ? catalog.values.subagentCatalog
        : undefined
      if (!Array.isArray(children)) return 0
      let count = 0
      for (const child of children) {
        if (child === null || child === undefined || child.mode === 'external') continue
        const childStatus = statuses.get(child.id)
        const childRunning = childStatus !== undefined && childStatus !== null
          ? childStatus.running
          : list.byId !== undefined && list.byId[child.id] !== undefined
            ? list.byId[child.id].running
            : undefined
        if (childRunning === true) count += 1
      }
      return count
    }

    function sessionRowOf(summary, status, list, statuses) {
      const pendingKind = pendingKindOf(status)
      const ownRunning = status !== undefined && status !== null && status.running !== undefined
        ? status.running === true
        : summary.running === true
      const runningChildren = runningChildCount(list, summary.id, statuses)
      const state = pendingKind !== null ? 'attention' : ownRunning || runningChildren > 0 ? 'running' : 'done'
      return {
        id: summary.id,
        title: sessionTitleOf(summary),
        state,
        rank: RANK[state],
        pendingKind,
        ownRunning,
        runningChildren,
        unread: status !== undefined && status !== null && status.completionUnread === true,
        updatedAt: typeof summary.updatedAt === 'number' && Number.isFinite(summary.updatedAt) ? summary.updatedAt : 0,
        cwd: typeof summary.cwd === 'string' ? summary.cwd : '',
        current: summary.retainedBy !== undefined && summary.retainedBy !== null && (summary.retainedBy.mainView === undefined ? 0 : summary.retainedBy.mainView) > 0,
      }
    }

    function compareSessionRows(left, right) {
      if (left.rank !== right.rank) return left.rank - right.rank
      if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt
      return String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0
    }

    function compareWorkspaceRows(left, right) {
      if (left.rank !== right.rank) return left.rank - right.rank
      if (left.activity !== right.activity) return right.activity - left.activity
      if (left.ungrouped !== right.ungrouped) return left.ungrouped ? 1 : -1
      const titleOrder = left.title.localeCompare(right.title)
      if (titleOrder !== 0) return titleOrder
      return String(left.key) < String(right.key) ? -1 : 1
    }

    function aggregateState(sessions) {
      let attention = false
      let running = false
      for (const session of sessions) {
        if (session.state === 'attention') attention = true
        else if (session.state === 'running') running = true
      }
      return attention ? 'attention' : running ? 'running' : 'done'
    }

    function workspaceActivity(sessions, workspace) {
      if (sessions.length > 0) {
        let latest = 0
        for (const session of sessions) if (session.updatedAt > latest) latest = session.updatedAt
        if (latest > 0) return latest
      }
      const updated = typeof workspace.updatedAt === 'string' ? Date.parse(workspace.updatedAt) : NaN
      if (Number.isFinite(updated) && updated > 0) return updated
      const created = typeof workspace.createdAt === 'string' ? Date.parse(workspace.createdAt) : NaN
      return Number.isFinite(created) && created > 0 ? created : 0
    }

    function workspaceRowOf(workspace, memberIds, byId, statuses, list, archived) {
      const sessions = []
      for (const id of memberIds) {
        const summary = byId[id]
        if (summary === undefined || summary === null) continue
        if (summary.origin === 'subagent' || summary.blank === true || archived.has(id)) continue
        sessions.push(sessionRowOf(summary, statuses.get(id), list, statuses))
      }
      sessions.sort(compareSessionRows)
      const state = aggregateState(sessions)
      const firstAttention = sessions.find((session) => session.state === 'attention')
      return {
        key: 'ws:' + String(workspace.workspaceId),
        workspaceId: workspace.workspaceId,
        ungrouped: false,
        title: (typeof workspace.title === 'string' ? workspace.title.trim() : '') || basenameOf(workspace.path),
        path: typeof workspace.path === 'string' ? workspace.path : '',
        sessions,
        state,
        rank: RANK[state],
        activity: workspaceActivity(sessions, workspace),
        pendingKind: firstAttention === undefined ? null : firstAttention.pendingKind,
      }
    }

    function ungroupedRowOf(memberIds, byId, statuses, list, archived) {
      const sessions = []
      for (const id of memberIds) {
        const summary = byId[id]
        if (summary === undefined || summary === null) continue
        if (summary.origin === 'subagent' || summary.blank === true || archived.has(id)) continue
        sessions.push(sessionRowOf(summary, statuses.get(id), list, statuses))
      }
      if (sessions.length === 0) return null
      sessions.sort(compareSessionRows)
      const state = aggregateState(sessions)
      const latest = sessions.reduce((value, session) => (session.updatedAt > value ? session.updatedAt : value), 0)
      const firstAttention = sessions.find((session) => session.state === 'attention')
      return {
        key: 'ungrouped',
        workspaceId: null,
        ungrouped: true,
        title: '',
        path: '',
        sessions,
        state,
        rank: RANK[state],
        activity: latest,
        pendingKind: firstAttention === undefined ? null : firstAttention.pendingKind,
      }
    }

    function buildModel(workspacesState, sessionsState, statuses, archivedWorkspaceIds) {
      const items = workspacesState !== undefined && workspacesState !== null && Array.isArray(workspacesState.items) ? workspacesState.items : []
      const archivedIds = workspacesState !== undefined && workspacesState !== null && Array.isArray(workspacesState.archivedSessionIds)
        ? workspacesState.archivedSessionIds
        : []
      const archived = new Set(archivedIds)
      const archivedGroups = archivedWorkspaceIds instanceof Set ? archivedWorkspaceIds : null
      const list = sessionsState !== undefined && sessionsState !== null && sessionsState.byId !== undefined ? sessionsState : EMPTY_SESSIONS
      const byId = list.byId !== undefined && list.byId !== null ? list.byId : {}
      const ids = Array.isArray(list.ids) ? list.ids : []
      const map = statuses instanceof Map ? statuses : EMPTY_MAP
      const accounted = new Set()
      const rows = []
      for (const workspace of items) {
        const memberIds = Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []
        for (const id of memberIds) accounted.add(id)
        if (archivedGroups !== null && archivedGroups.has(workspace.workspaceId)) continue
        rows.push(workspaceRowOf(workspace, memberIds, byId, map, list, archived))
      }
      const strayIds = ids.filter((id) => !accounted.has(id))
      const ungrouped = strayIds.length === 0 ? null : ungroupedRowOf(strayIds, byId, map, list, archived)
      if (ungrouped !== null) rows.push(ungrouped)
      rows.sort(compareWorkspaceRows)
      return rows
    }

    function currentSessionId(list) {
      if (list === undefined || list === null || list.byId === undefined || list.byId === null) return null
      for (const id of Object.keys(list.byId)) {
        const summary = list.byId[id]
        if (summary !== undefined && summary !== null && summary.retainedBy !== undefined && summary.retainedBy !== null && (summary.retainedBy.mainView === undefined ? 0 : summary.retainedBy.mainView) > 0) return id
      }
      return null
    }

    function matchesText(value, needle) {
      return typeof value === 'string' && value.toLowerCase().includes(needle)
    }

    function withSessions(row, sessions) {
      const sorted = sessions.slice().sort(compareSessionRows)
      const state = aggregateState(sorted)
      const firstAttention = sorted.find((session) => session.state === 'attention')
      const activity = sorted.length === 0
        ? row.activity
        : sorted.reduce((latest, session) => (session.updatedAt > latest ? session.updatedAt : latest), 0)
      return Object.assign({}, row, {
        sessions: sorted,
        state,
        rank: RANK[state],
        activity,
        pendingKind: firstAttention === undefined ? null : firstAttention.pendingKind,
      })
    }

    /**
     * Narrow the workspace zone for a search query. A matching task title shows
     * only the matching tasks; a workspace title/path match with no task match
     * keeps the workspace and its tasks.
     */
    function filterRows(rows, query, tr) {
      const needle = typeof query === 'string' ? query.trim().toLowerCase() : ''
      if (needle.length === 0) return rows
      const out = []
      for (const row of rows) {
        const title = row.ungrouped ? tr('ungrouped') : row.title.length > 0 ? row.title : tr('untitled')
        const titleHit = matchesText(title, needle) || matchesText(row.path, needle)
        const sessionHits = row.sessions.filter((session) => matchesText(session.title, needle))
        if (!titleHit && sessionHits.length === 0) continue
        out.push(withSessions(row, sessionHits.length > 0 ? sessionHits : row.sessions))
      }
      out.sort(compareWorkspaceRows)
      return out
    }

    /**
     * Project archived sessions for the bottom restore section: newest first,
     * excluding subagent and blank rows, with the owning workspace title.
     */
    function buildArchivedItems(workspacesState, sessionsState) {
      const items = workspacesState !== undefined && workspacesState !== null && Array.isArray(workspacesState.items) ? workspacesState.items : []
      const archivedIds = workspacesState !== undefined && workspacesState !== null && Array.isArray(workspacesState.archivedSessionIds)
        ? workspacesState.archivedSessionIds
        : []
      const list = sessionsState !== undefined && sessionsState !== null && sessionsState.byId !== undefined ? sessionsState : EMPTY_SESSIONS
      const byId = list.byId !== undefined && list.byId !== null ? list.byId : {}
      const ownerById = new Map()
      for (const workspace of items) {
        for (const id of Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []) ownerById.set(id, workspace)
      }
      const result = []
      for (const id of archivedIds) {
        const summary = byId[id]
        if (summary === undefined || summary === null || summary.origin === 'subagent' || summary.blank === true) continue
        const owner = ownerById.get(id)
        const workspaceTitle = owner === undefined
          ? ''
          : (typeof owner.title === 'string' ? owner.title.trim() : '') || basenameOf(owner.path)
        result.push({
          id,
          title: sessionTitleOf(summary),
          workspaceTitle,
          updatedAt: typeof summary.updatedAt === 'number' && Number.isFinite(summary.updatedAt) ? summary.updatedAt : 0,
        })
      }
      result.sort((left, right) => right.updatedAt - left.updatedAt)
      return result
    }

    // ---------------------------------------------------------------------
    // Active zone model
    // ---------------------------------------------------------------------

    /**
     * sessionId → owning workspace {workspaceId, title, path}. The ungrouped
     * row contributes a null-workspace entry labeled by `ungroupedLabel`.
     */
    function buildWorkspaceIndex(rows, ungroupedLabel) {
      const index = new Map()
      for (const row of rows) {
        const info = row.ungrouped
          ? { workspaceId: null, title: ungroupedLabel, path: '' }
          : { workspaceId: row.workspaceId, title: row.title, path: row.path }
        for (const session of row.sessions) index.set(session.id, info)
      }
      return index
    }

    /**
     * Sessions for the active zone: everything the workspace zone shows
     * (archived/subagent/blank already excluded) filtered to the activity
     * window. In mode b a session stays hidden while its last activity is not
     * newer than its dismissal record; newer activity re-admits it.
     * Sorted needs-input → running → done, most recent first within a state.
     */
    function activeSessionsOf(rows, settings, dismissals, now, workspaceIndex) {
      const windowDays = Number(settings.windowDays)
      const windowMs = Number.isFinite(windowDays) && windowDays > 0 ? windowDays * DAY_MS : DEFAULT_SETTINGS.windowDays * DAY_MS
      const cutoff = now - windowMs
      const out = []
      for (const row of rows) {
        for (const session of row.sessions) {
          if (session.updatedAt <= 0 || session.updatedAt < cutoff) continue
          if (settings.mode === 'b') {
            const dismissedAt = dismissals[session.id]
            if (typeof dismissedAt === 'number' && session.updatedAt <= dismissedAt) continue
          }
          out.push(Object.assign({}, session, { workspace: workspaceIndex.get(session.id) || null }))
        }
      }
      out.sort(compareSessionRows)
      return out
    }

    // ---------------------------------------------------------------------
    // Time presentation
    // ---------------------------------------------------------------------

    function localeTag() {
      try {
        const tag = document.documentElement.getAttribute('lang')
        return typeof tag === 'string' && tag.length > 0 ? tag : undefined
      } catch {
        return undefined
      }
    }

    function absoluteDate(timestamp) {
      try {
        return new Intl.DateTimeFormat(localeTag(), { month: 'short', day: 'numeric' }).format(new Date(timestamp))
      } catch {
        return new Date(timestamp).toLocaleDateString()
      }
    }

    function absoluteMoment(timestamp) {
      try {
        return new Intl.DateTimeFormat(localeTag(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))
      } catch {
        return new Date(timestamp).toLocaleString()
      }
    }

    function relativeLabel(timestamp, now, tr) {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return tr('time.unknown')
      const diff = Math.max(0, now - timestamp)
      if (diff < 60000) return tr('time.now')
      const minutes = Math.floor(diff / 60000)
      if (minutes < 60) return tr('time.minutes', { n: minutes })
      const hours = Math.floor(diff / 3600000)
      if (hours < 24) return tr('time.hours', { n: hours })
      const days = Math.floor(diff / 86400000)
      if (days < 7) return tr('time.days', { n: days })
      return absoluteDate(timestamp)
    }

    function useNow(intervalMs) {
      const [now, setNow] = React.useState(() => Date.now())
      React.useEffect(() => {
        const tick = () => setNow(Date.now())
        const handle = setInterval(tick, intervalMs)
        const onVisibility = () => {
          if (!document.hidden) tick()
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
          clearInterval(handle)
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [intervalMs])
      return now
    }

    // ---------------------------------------------------------------------
    // Error helpers
    // ---------------------------------------------------------------------

    function isActiveArchiveRefusal(reason) {
      if (reason === null || reason === undefined || typeof reason !== 'object') return false
      if (reason.name === 'WorkspaceArchiveError' && reason.rpcError !== undefined && reason.rpcError !== null && reason.rpcError.code === 'workspace/session-active') return true
      const message = typeof reason.message === 'string' ? reason.message : ''
      return message.includes('workspace/session-active')
    }

    function messageOf(reason) {
      if (reason !== null && reason !== undefined && typeof reason.message === 'string' && reason.message.length > 0) return reason.message
      return String(reason)
    }

    // ---------------------------------------------------------------------
    // Last-message preview (hover details)
    // ---------------------------------------------------------------------

    const previewCache = new Map()
    let remoteRef = null

    /**
     * Resolves {text} for the most recent turn of a session, or null when no
     * preview is available. One-shot RPC (`session.projections` returns every
     * projection key for the session); hover-only, single card, cached.
     * Never throws.
     */
    async function loadLastMessage(sessionId) {
      const remote = remoteRef
      if (remote === null || typeof remote.session?.projections !== 'function') return null
      const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : undefined
      try {
        const result = await remote.session.projections({ sessionId }, signal)
        const value = result !== undefined && result !== null && result.ok === true ? result.value : null
        const values = value !== undefined && value !== null && value.values !== undefined && value.values !== null ? value.values : null
        const turns = values !== null && Array.isArray(values.turnOutline) ? values.turnOutline : null
        if (turns === null || turns.length === 0) return null
        const last = turns[turns.length - 1]
        const response = typeof last.response === 'string' ? last.response.trim() : ''
        const prompt = typeof last.prompt === 'string' ? last.prompt.trim() : ''
        const text = response.length > 0 ? response : prompt
        return text.length > 0 ? { text } : null
      } catch {
        return null
      }
    }

    function useMessagePreview(sessionId, active) {
      const [preview, setPreview] = React.useState(() => previewCache.get(sessionId) || null)
      React.useEffect(() => {
        if (!active) return undefined
        const cached = previewCache.get(sessionId)
        if (cached !== undefined && cached.status !== 'pending') {
          setPreview(cached)
          return undefined
        }
        let cancelled = false
        previewCache.set(sessionId, { status: 'pending' })
        loadLastMessage(sessionId)
          .then((result) => {
            const value = result !== null && typeof result.text === 'string' && result.text.length > 0
              ? { status: 'ready', text: result.text, ts: typeof result.ts === 'number' ? result.ts : null }
              : { status: 'empty' }
            previewCache.set(sessionId, value)
            if (!cancelled) setPreview(value)
          })
          .catch(() => {
            previewCache.set(sessionId, { status: 'empty' })
            if (!cancelled) setPreview({ status: 'empty' })
          })
        return () => {
          cancelled = true
        }
      }, [sessionId, active])
      return preview
    }

    // ---------------------------------------------------------------------
    // Icons
    // ---------------------------------------------------------------------

    function StatusIcon({ state, size }) {
      const dimension = size === undefined ? 14 : size
      const common = {
        width: dimension,
        height: dimension,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' },
      }
      if (state === 'attention') {
        return h('svg', common, h('path', { d: 'M12 3.4 21.3 20.2H2.7L12 3.4Z' }), h('path', { d: 'M12 9.3v4.7' }), h('circle', { cx: 12, cy: 17.2, r: 1.15, fill: 'currentColor', stroke: 'none' }))
      }
      if (state === 'running') {
        return h(
          'svg',
          Object.assign({}, common, { className: 'wsc-spin' }),
          h('circle', { cx: 12, cy: 12, r: 8.4, opacity: 0.3 }),
          h('path', { d: 'M20.4 12A8.4 8.4 0 0 0 12 3.6' }),
        )
      }
      return h('svg', common, h('circle', { cx: 12, cy: 12, r: 8.4 }), h('path', { d: 'm8.1 12.2 2.7 2.7 5.1-5.4' }))
    }

    function ChevronIcon({ open }) {
      return h(
        'svg',
        { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', style: { display: 'block' } },
        h('path', { d: open ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6' }),
      )
    }

    function PlusIcon({ size }) {
      const dimension = size === undefined ? 14 : size
      return h(
        'svg',
        { width: dimension, height: dimension, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': 'true', focusable: 'false', style: { display: 'block' } },
        h('path', { d: 'M12 5v14M5 12h14' }),
      )
    }

    function SearchIcon({ size }) {
      const dimension = size === undefined ? 13 : size
      return h(
        'svg',
        { width: dimension, height: dimension, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', style: { display: 'block' } },
        h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }),
        h('path', { d: 'm15.4 15.4 5 5' }),
      )
    }

    function CloseIcon({ size }) {
      const dimension = size === undefined ? 11 : size
      return h(
        'svg',
        { width: dimension, height: dimension, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', style: { display: 'block' } },
        h('path', { d: 'M6 6l12 12M18 6l-12 12' }),
      )
    }

    function ArchiveIcon({ size }) {
      const dimension = size === undefined ? 13 : size
      return h(
        'svg',
        { width: dimension, height: dimension, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', style: { display: 'block' } },
        h('rect', { x: 3.5, y: 4.5, width: 17, height: 4, rx: 1 }),
        h('path', { d: 'M5.5 8.5v9A1.5 1.5 0 0 0 7 19h10a1.5 1.5 0 0 0 1.5-1.5v-9' }),
        h('path', { d: 'M10 12.5h4' }),
      )
    }

    function PencilIcon({ size }) {
      const dimension = size === undefined ? 13 : size
      return h(
        'svg',
        { width: dimension, height: dimension, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', style: { display: 'block' } },
        h('path', { d: 'M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4Z' }),
        h('path', { d: 'm13.5 6.5 4 4' }),
      )
    }

    // ---------------------------------------------------------------------
    // Presentation pieces
    // ---------------------------------------------------------------------

    function CountChip({ state, count, tr }) {
      return h(
        'span',
        { className: 'wsc-chip', 'data-state': state, 'data-zero': count === 0 ? 'true' : 'false', title: tr('state.' + state) },
        h(StatusIcon, { state, size: 10 }),
        String(count),
      )
    }

    function hueOf(title) {
      let hash = 0
      const text = String(title)
      for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
      return hash % 360
    }

    function initialsOf(title) {
      const clean = String(title).trim()
      if (clean.length === 0) return '·'
      const words = clean.split(/[\s\-_/\\.]+/).filter(Boolean)
      if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
      return clean.slice(0, 2).toUpperCase()
    }

    function ProjectAvatar({ title, size }) {
      const dimension = size === undefined ? 14 : size
      const label = typeof title === 'string' && title.trim().length > 0 ? title.trim() : '?'
      return h(
        'span',
        {
          className: 'wsc-avatar',
          'aria-hidden': 'true',
          style: {
            width: dimension,
            height: dimension,
            borderRadius: Math.max(3, Math.round(dimension / 3.5)),
            fontSize: Math.max(7, Math.round(dimension / 1.9)),
            background: 'hsl(' + hueOf(label) + ' 42% 46%)',
          },
        },
        initialsOf(label),
      )
    }

    function UnreadDot() {
      return h('span', { className: 'wsc-unread-dot', 'aria-hidden': 'true' })
    }

    /** State icon that stays quiet for settled sessions: done + read + no pending renders an invisible placeholder, keeping row alignment. */
    function SessionStateIcon({ state, unread, size, className }) {
      const icon = h(StatusIcon, { state, size })
      if (state === 'done' && unread !== true) {
        return h('span', { className, 'aria-hidden': 'true', style: { visibility: 'hidden' } }, icon)
      }
      return h('span', { className }, icon)
    }

    function detailRow(label, value) {
      return h('div', { className: 'wsc-detail-row' }, h('span', { className: 'wsc-detail-label' }, label), h('span', { className: 'wsc-detail-value', title: value }, value))
    }

    // ---------------------------------------------------------------------
    // Active zone
    // ---------------------------------------------------------------------

    /**
     * Module-scope hover channel between the cards and the shell.overlay tip.
     * Holds {session, rect} while a card is hovered/focused, null otherwise.
     */
    const tipListeners = new Set()
    let tipState = null

    function setTip(next) {
      tipState = next
      for (const listener of tipListeners) listener(tipState)
    }

    function subscribeTip(listener) {
      tipListeners.add(listener)
      return () => tipListeners.delete(listener)
    }

    function useTip() {
      const [value, setValue] = React.useState(() => tipState)
      React.useEffect(() => subscribeTip(setValue), [])
      return value
    }

    /** Frame-wide floating tip: fixed near the hovered card, right side first, flipped when it would leave the viewport. */
    function CardTipOverlay(props) {
      const tr = typeof props.t === 'function' ? props.t : (key) => key
      const tip = useTip()
      const sessionId = tip !== null ? tip.session.id : null
      const preview = useMessagePreview(sessionId, tip !== null)

      React.useEffect(() => {
        if (tip === null) return undefined
        const close = () => setTip(null)
        const onKey = (event) => {
          if (event.key === 'Escape') close()
        }
        window.addEventListener('scroll', close, { capture: true })
        window.addEventListener('keydown', onKey)
        return () => {
          window.removeEventListener('scroll', close, { capture: true })
          window.removeEventListener('keydown', onKey)
        }
      }, [tip])

      if (tip === null) return null
      const session = tip.session
      const workspace = session.workspace
      const tipWidth = 300
      const margin = 8
      const rect = tip.rect
      const viewportWidth = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1280
      const viewportHeight = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 800
      let left = rect.right + margin
      if (left + tipWidth > viewportWidth - margin) left = rect.left - tipWidth - margin
      if (left < margin) left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - tipWidth - margin))
      const top = Math.min(Math.max(margin, rect.top), Math.max(margin, viewportHeight - 160))
      const stateLabel = tr('state.' + session.state)

      return h(
        'div',
        { className: 'wsc-tip', style: { left: Math.round(left), top: Math.round(top) }, role: 'tooltip' },
        h(
          'div',
          { className: 'wsc-tip-title' },
          h('span', { className: 'wsc-card-icon' }, h(StatusIcon, { state: session.state, size: 13 })),
          h('span', { className: 'wsc-tip-title-text' }, session.title.length > 0 ? session.title : tr('unnamedSession')),
          session.pendingKind !== null ? h('span', { className: 'wsc-badge' }, tr(PENDING_KINDS[session.pendingKind])) : null,
        ),
        h(
          'div',
          { className: 'wsc-tip-rows' },
          detailRow(stateLabel + ' · ' + relativeLabel(session.updatedAt, tip.now, tr), workspace !== null && workspace.title.length > 0 ? workspace.title : tr('ungrouped')),
          workspace !== null && workspace.path.length > 0 ? detailRow(tr('details.path'), workspace.path) : null,
          detailRow(tr('details.active'), absoluteMoment(session.updatedAt)),
          h(
            'div',
            { className: 'wsc-detail-row' },
            h('span', { className: 'wsc-detail-label' }, tr('details.message')),
            preview === null
              ? h('span', { className: 'wsc-detail-value' }, '…')
              : preview.status === 'pending'
                ? h('span', { className: 'wsc-detail-value' }, '…')
                : preview.status === 'empty'
                  ? h('span', { className: 'wsc-detail-value' }, tr('details.noMessage'))
                  : h('div', { className: 'wsc-detail-message' }, preview.text),
          ),
        ),
      )
    }

    function ActiveCard({ session, now, current, onOpen, tr }) {
      const workspace = session.workspace
      const stateLabel = tr('state.' + session.state)
      return h(
        'button',
        {
          type: 'button',
          className: 'wsc-card',
          'data-state': session.state,
          'data-current': current ? 'true' : 'false',
          title: stateLabel + ' · ' + relativeLabel(session.updatedAt, now, tr),
          onClick: () => onOpen(session.id),
          onMouseEnter: (event) => setTip({ session, rect: event.currentTarget.getBoundingClientRect(), now }),
          onMouseLeave: () => setTip(null),
          onFocus: (event) => setTip({ session, rect: event.currentTarget.getBoundingClientRect(), now }),
          onBlur: () => setTip(null),
        },
        h(
          'span',
          { className: 'wsc-card-row1' },
          h(SessionStateIcon, { state: session.state, unread: session.unread, size: 13, className: 'wsc-card-icon' }),
          h('span', { className: 'wsc-card-title' }, session.title.length > 0 ? session.title : tr('unnamedSession')),
          session.pendingKind !== null ? h('span', { className: 'wsc-badge' }, tr(PENDING_KINDS[session.pendingKind])) : null,
          session.state === 'done' && session.unread ? h(UnreadDot) : null,
          h('span', { className: 'wsc-card-time' }, relativeLabel(session.updatedAt, now, tr)),
        ),
        h(
          'span',
          { className: 'wsc-card-row2' },
          h(ProjectAvatar, { title: workspace !== null ? workspace.title : '', size: 14 }),
          h('span', { className: 'wsc-ws-name' }, workspace !== null && workspace.title.length > 0 ? workspace.title : tr('ungrouped')),
        ),
      )
    }

    function ActiveZone({ sessions, collapsed, onToggle, now, currentId, onOpen, tr }) {
      const firstDoneIndex = sessions.findIndex((session) => session.rank >= RANK.done)
      const cards = []
      sessions.forEach((session, index) => {
        if (index === firstDoneIndex && firstDoneIndex > 0) {
          cards.push(h('div', { key: 'done-divider', className: 'wsc-divider' }, tr('active.recentDone')))
        }
        cards.push(h(ActiveCard, {
          key: session.id,
          session,
          now,
          current: session.id === currentId,
          onOpen,
          tr,
        }))
      })
      return h(
        'section',
        { className: 'wsc-active', 'data-collapsed': collapsed ? 'true' : 'false', 'aria-label': tr('active.title') },
        h(
          'div',
          { className: 'wsc-active-head' },
          h(
            'button',
            {
              type: 'button',
              className: 'wsc-active-toggle',
              'aria-expanded': collapsed ? 'false' : 'true',
              title: tr(collapsed ? 'active.expand' : 'active.collapse'),
              onClick: onToggle,
            },
            h('span', { className: 'wsc-chevron' }, h(ChevronIcon, { open: !collapsed })),
            h('span', { className: 'wsc-active-title' }, tr('active.title')),
            h('span', { className: 'wsc-active-count' }, String(sessions.length)),
          ),
        ),
        collapsed
          ? null
          : sessions.length === 0
            ? h('div', { className: 'wsc-active-empty' }, tr('active.empty'))
            : h('div', { className: 'wsc-cards' }, cards),
      )
    }

    // ---------------------------------------------------------------------
    // Workspace zone rows
    // ---------------------------------------------------------------------

    function sessionTail(session, now, tr) {
      if (session.pendingKind !== null) return tr(PENDING_KINDS[session.pendingKind])
      if (session.state === 'running') {
        return session.runningChildren > 0 ? tr('running.children', { n: session.runningChildren }) : relativeLabel(session.updatedAt, now, tr)
      }
      return relativeLabel(session.updatedAt, now, tr)
    }

    function RenameRow({ initial, placeholder, saveLabel, cancelLabel, busy, onSave, onCancel, sessionVariant }) {
      const [draft, setDraft] = React.useState(initial)
      return h(
        'div',
        { className: sessionVariant ? 'wsc-rename wsc-rename-session' : 'wsc-rename' },
        h('input', {
          className: 'wsc-rename-input',
          type: 'text',
          value: draft,
          autoFocus: true,
          placeholder,
          'aria-label': placeholder,
          disabled: busy,
          spellCheck: false,
          onChange: (event) => setDraft(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            } else if (event.key === 'Enter') {
              event.preventDefault()
              if (draft.trim().length > 0) onSave(draft.trim())
            }
          },
        }),
        h('button', { type: 'button', className: 'wsc-rename-save', disabled: busy || draft.trim().length === 0, onClick: () => onSave(draft.trim()) }, saveLabel),
        h('button', { type: 'button', className: 'wsc-rename-cancel', disabled: busy, onClick: onCancel }, cancelLabel),
      )
    }

    function SessionEntry({ session, now, currentId, renaming, busy, onOpen, onRenameStart, onRename, onArchive, tr }) {
      return h(
        'div',
        { className: 'wsc-session', 'data-state': session.state, 'data-current': session.id === currentId ? 'true' : 'false' },
        renaming
          ? h(RenameRow, {
            key: 'rename',
            initial: session.title,
            placeholder: tr('renameTask.placeholder'),
            saveLabel: tr('rename.save'),
            cancelLabel: tr('rename.cancel'),
            busy,
            sessionVariant: true,
            onSave: (title) => onRename(session.id, title),
            onCancel: () => onRenameStart(null),
          })
          : [
            h(
              'button',
              {
                key: 'main',
                type: 'button',
                className: 'wsc-session-main',
                title: session.title.length > 0 ? session.title : tr('unnamedSession'),
                onClick: () => onOpen(session.id),
              },
              h(SessionStateIcon, { state: session.state, unread: session.unread, size: 13, className: 'wsc-session-icon' }),
              h('span', { className: 'wsc-session-title' }, session.title.length > 0 ? session.title : tr('unnamedSession')),
              h('span', { className: 'wsc-session-tail' }, sessionTail(session, now, tr)),
            ),
            h(
              'button',
              {
                key: 'rename',
                type: 'button',
                className: 'wsc-session-rename',
                title: tr('renameTask.action'),
                'aria-label': tr('renameTask.action'),
                disabled: busy,
                onClick: () => onRenameStart(session.id),
              },
              h(PencilIcon, { size: 12 }),
            ),
            h(
              'button',
              {
                key: 'archive',
                type: 'button',
                className: 'wsc-session-archive',
                title: tr('archive.action'),
                'aria-label': tr('archive.action'),
                disabled: busy,
                onClick: () => onArchive(session),
              },
              h(ArchiveIcon, { size: 12 }),
            ),
          ],
      )
    }

    function WorkspaceEntry({ row, now, collapsed, doneExpanded, renaming, renamingSession, busy, currentId, onToggle, onToggleDone, onOpenSession, onNewSession, onRenameStart, onRename, onRenameSessionStart, onRenameSession, onArchiveSession, onArchiveWorkspace, tr }) {
      const visibleSessions = doneExpanded
        ? row.sessions
        : row.sessions.filter((session, index) => session.rank < RANK.done || index < DONE_PREVIEW_LIMIT)
      const hiddenDone = row.sessions.length - visibleSessions.length
      const label = row.ungrouped ? tr('ungrouped') : row.title.length > 0 ? row.title : tr('untitled')
      return h(
        'div',
        { className: 'wsc-group', 'data-state': row.state },
        h(
          'div',
          { className: 'wsc-group-head' },
          renaming
            ? h(RenameRow, {
              key: 'rename',
              initial: row.title,
              placeholder: tr('rename.placeholder'),
              saveLabel: tr('rename.save'),
              cancelLabel: tr('rename.cancel'),
              busy,
              onSave: (title) => onRename(row.workspaceId, title),
              onCancel: () => onRenameStart(null),
            })
            : [
              h(
                'button',
                {
                  key: 'toggle',
                  type: 'button',
                  className: 'wsc-toggle',
                  'aria-expanded': collapsed ? 'false' : 'true',
                  title: tr(collapsed ? 'expand' : 'collapse', { name: label }),
                  onClick: () => onToggle(row.key),
                },
                h('span', { className: 'wsc-chevron' }, h(ChevronIcon, { open: !collapsed })),
                row.ungrouped ? null : h('span', { className: 'wsc-ws-avatar' }, h(ProjectAvatar, { title: row.title, size: 16 })),
                h('span', { className: 'wsc-ws-title' }, label),
              ),
              h('span', { className: 'wsc-pill', 'data-state': row.state }, row.pendingKind !== null ? tr(PENDING_KINDS[row.pendingKind]) : tr('state.' + row.state)),
              row.ungrouped
                ? null
                : [
                  h(
                    'button',
                    {
                      key: 'new',
                      type: 'button',
                      className: 'wsc-new',
                      title: tr('newSession', { name: label }),
                      'aria-label': tr('newSession', { name: label }),
                      disabled: busy,
                      onClick: () => onNewSession(row.workspaceId),
                    },
                    h(PlusIcon, { size: 13 }),
                  ),
                  h(
                    'button',
                    {
                      key: 'rename',
                      type: 'button',
                      className: 'wsc-rename-action',
                      title: tr('rename.action'),
                      'aria-label': tr('rename.action'),
                      disabled: busy,
                      onClick: () => onRenameStart(row.workspaceId),
                    },
                    h(PencilIcon, { size: 12 }),
                  ),
                  h(
                    'button',
                    {
                      key: 'archive',
                      type: 'button',
                      className: 'wsc-ws-archive',
                      title: tr('archiveWorkspace.action'),
                      'aria-label': tr('archiveWorkspace.action'),
                      disabled: busy,
                      onClick: () => onArchiveWorkspace(row),
                    },
                    h(ArchiveIcon, { size: 12 }),
                  ),
                ],
            ],
        ),
        collapsed
          ? null
          : [
            row.sessions.length === 0
              ? h('div', { key: 'none', className: 'wsc-none' }, tr('tasks.none'))
              : h(
                'div',
                { key: 'sessions', className: 'wsc-sessions', role: 'list', 'aria-label': label },
                visibleSessions.map((session) => h(SessionEntry, {
                  key: session.id,
                  session,
                  now,
                  currentId,
                  renaming: renamingSession === session.id,
                  busy,
                  onOpen: onOpenSession,
                  onRenameStart: onRenameSessionStart,
                  onRename: onRenameSession,
                  onArchive: onArchiveSession,
                  tr,
                })),
              ),
            hiddenDone > 0
              ? h(
                'button',
                {
                  key: 'more',
                  type: 'button',
                  className: 'wsc-more',
                  onClick: () => onToggleDone(row.key),
                },
                h('span', { className: 'wsc-chevron' }, h(ChevronIcon, { open: doneExpanded })),
                tr(doneExpanded ? 'done.less' : 'done.more', { n: hiddenDone }),
              )
              : null,
          ],
      )
    }

    function ArchivedWorkspacesSection({ items, expanded, onToggle, onRestore, tr }) {
      return h(
        'div',
        { className: 'wsc-archived' },
        h(
          'button',
          { type: 'button', className: 'wsc-archived-head', 'aria-expanded': expanded ? 'true' : 'false', onClick: onToggle },
          h('span', { className: 'wsc-chevron' }, h(ChevronIcon, { open: expanded })),
          tr('archivedWorkspaces.title', { n: items.length }),
        ),
        expanded
          ? h(
            'div',
            { className: 'wsc-archived-list' },
            items.map((item) => h(
              'div',
              { key: item.id, className: 'wsc-archived-row' },
              h('span', { className: 'wsc-archived-icon' }, h(ArchiveIcon, { size: 12 })),
              h('span', { className: 'wsc-archived-text' }, h('span', { className: 'wsc-archived-title' }, item.title)),
              h(
                'button',
                { type: 'button', className: 'wsc-restore', onClick: () => onRestore(item.id) },
                tr('archived.restore'),
              ),
            )),
          )
          : null,
      )
    }

    function ArchivedSection({ items, expanded, restoringId, now, onToggle, onRestore, tr }) {
      return h(
        'div',
        { className: 'wsc-archived' },
        h(
          'button',
          { type: 'button', className: 'wsc-archived-head', 'aria-expanded': expanded ? 'true' : 'false', onClick: onToggle },
          h('span', { className: 'wsc-chevron' }, h(ChevronIcon, { open: expanded })),
          tr('archived.title', { n: items.length }),
        ),
        expanded
          ? h(
            'div',
            { className: 'wsc-archived-list' },
            items.map((item) => h(
              'div',
              { key: item.id, className: 'wsc-archived-row' },
              h('span', { className: 'wsc-archived-icon' }, h(ArchiveIcon, { size: 12 })),
              h(
                'span',
                { className: 'wsc-archived-text' },
                h('span', { className: 'wsc-archived-title' }, item.title.length > 0 ? item.title : tr('unnamedSession')),
                h('span', { className: 'wsc-archived-meta' }, (item.workspaceTitle.length > 0 ? item.workspaceTitle + ' · ' : '') + relativeLabel(item.updatedAt, now, tr)),
              ),
              h(
                'button',
                { type: 'button', className: 'wsc-restore', disabled: restoringId === item.id, onClick: () => onRestore(item.id) },
                tr('archived.restore'),
              ),
            )),
          )
          : null,
      )
    }

    // ---------------------------------------------------------------------
    // Board
    // ---------------------------------------------------------------------

    function Statuscard(props) {
      const tr = typeof props.t === 'function' ? props.t : (key) => key
      const wide = props.wide !== false
      const expandSidebar = typeof props.expandSidebar === 'function' ? props.expandSidebar : () => {}
      const openSessionBase = typeof props.openSession === 'function' ? props.openSession : () => {}
      const startSession = typeof props.startSession === 'function' ? props.startSession : () => {}
      const addWorkspace = typeof props.addWorkspace === 'function' ? props.addWorkspace : async () => null
      const pickDirectory = typeof props.pickDirectory === 'function' ? props.pickDirectory : async () => null
      const archiveSession = typeof props.archiveSession === 'function' ? props.archiveSession : async () => {}
      const unarchiveSession = typeof props.unarchiveSession === 'function' ? props.unarchiveSession : async () => {}
      const renameWorkspace = typeof props.renameWorkspace === 'function' ? props.renameWorkspace : async () => {}
      const renameSession = typeof props.renameSession === 'function' ? props.renameSession : async () => {}

      const useWorkspaces = props.useWorkspaces
      const useSessions = props.useSessions
      const useSessionStatus = props.useSessionStatus
      const usePanelInfo = props.usePanelInfo

      const workspacesState = useWorkspaces((state) => state)
      const sessionsState = useSessions((state) => state)
      const statuses = useSessionStatus((state) => state)
      const panelActive = usePanelInfo((info) => info.activePanelId !== null)

      const [settings] = useSettings()
      const now = useNow(30000)
      const [collapsed, setCollapsed] = React.useState(readCollapsedMap)
      const [activeCollapsed, setActiveCollapsedState] = React.useState(readActiveCollapsed)
      const [doneExpanded, setDoneExpanded] = React.useState({})
      const [archivedWorkspaces, setArchivedWorkspaces] = React.useState(readArchivedWorkspaces)
      const [dismissals, commitDismiss] = useDismissals()
      const [query, setQuery] = React.useState('')
      const [adding, setAdding] = React.useState(false)
      const [addError, setAddError] = React.useState(null)
      const [addPathOpen, setAddPathOpen] = React.useState(false)
      const [addPathDraft, setAddPathDraft] = React.useState('')
      const [notice, setNotice] = React.useState(null)
      const [archiveConfirm, setArchiveConfirm] = React.useState(null)
      const [archiveBusy, setArchiveBusy] = React.useState(false)
      const [renamingWorkspace, setRenamingWorkspace] = React.useState(null)
      const [renamingSession, setRenamingSession] = React.useState(null)
      const [archivedOpen, setArchivedOpen] = React.useState(false)
      const [archivedWorkspacesOpen, setArchivedWorkspacesOpen] = React.useState(false)
      const [restoringId, setRestoringId] = React.useState(null)

      React.useEffect(() => {
        if (addError === null) return undefined
        const handle = setTimeout(() => setAddError(null), 6000)
        return () => clearTimeout(handle)
      }, [addError])

      React.useEffect(() => {
        if (notice === null) return undefined
        const handle = setTimeout(() => setNotice(null), 6000)
        return () => clearTimeout(handle)
      }, [notice])

      const archivedWorkspaceSet = React.useMemo(() => {
        const set = new Set()
        for (const [id, flag] of Object.entries(archivedWorkspaces)) if (flag === true) set.add(id)
        return set
      }, [archivedWorkspaces])

      const rows = React.useMemo(
        () => buildModel(workspacesState, sessionsState, statuses, archivedWorkspaceSet),
        [workspacesState, sessionsState, statuses, archivedWorkspaceSet],
      )
      const queryActive = query.trim().length > 0
      const visibleRows = React.useMemo(() => filterRows(rows, query, tr), [rows, query, tr])
      const counts = React.useMemo(() => {
        const next = { attention: 0, running: 0, done: 0 }
        for (const row of rows) next[row.state] += 1
        return next
      }, [rows])

      const workspaceIndex = React.useMemo(
        () => buildWorkspaceIndex(rows, tr('ungrouped')),
        [rows, tr],
      )
      const archivedItems = React.useMemo(
        () => buildArchivedItems(workspacesState, sessionsState),
        [workspacesState, sessionsState],
      )
      const archivedWorkspaceItems = React.useMemo(() => {
        const items = workspacesState !== undefined && workspacesState !== null && Array.isArray(workspacesState.items) ? workspacesState.items : []
        return items
          .filter((workspace) => archivedWorkspaceSet.has(workspace.workspaceId))
          .map((workspace) => ({
            id: workspace.workspaceId,
            title: (typeof workspace.title === 'string' ? workspace.title.trim() : '') || basenameOf(workspace.path) || tr('untitled'),
          }))
          .sort((left, right) => left.title.localeCompare(right.title))
      }, [workspacesState, archivedWorkspaceSet, tr])

      // Prune stale dismissal records: a session whose activity is newer than
      // its dismissal has re-entered; a session that no longer exists is gone.
      React.useEffect(() => {
        const updatedAtById = new Map()
        for (const row of rows) for (const session of row.sessions) updatedAtById.set(session.id, session.updatedAt)
        let changed = false
        const next = Object.assign({}, dismissals)
        for (const [id, at] of Object.entries(dismissals)) {
          const updatedAt = updatedAtById.get(id)
          if (updatedAt === undefined || updatedAt > at) {
            delete next[id]
            changed = true
          }
        }
        if (changed) {
          commitDismissals(next)
        }
      }, [rows, dismissals])

      const activeSessions = React.useMemo(
        () => activeSessionsOf(rows, settings, dismissals, now, workspaceIndex),
        [rows, settings, dismissals, now, workspaceIndex],
      )
      const currentId = panelActive ? null : currentSessionId(sessionsState)

      const openSession = React.useCallback((sessionId) => {
        if (settings.mode === 'b') {
          commitDismissals((previous) => Object.assign({}, previous, { [sessionId]: Date.now() }))
        }
        openSessionBase(sessionId)
      }, [settings.mode, openSessionBase])

      const toggleActiveCollapsed = () => {
        setActiveCollapsedState((previous) => {
          writeActiveCollapsed(!previous)
          return !previous
        })
      }

      const toggle = (key) => {
        setCollapsed((previous) => {
          const next = Object.assign({}, previous)
          if (next[key] === true) delete next[key]
          else next[key] = true
          writeStoredMap(COLLAPSE_KEY, next)
          return next
        })
      }

      const toggleDone = (key) => {
        setDoneExpanded((previous) => {
          const next = Object.assign({}, previous)
          if (next[key] === true) delete next[key]
          else next[key] = true
          return next
        })
      }

      const archiveWorkspace = (row) => {
        if (row.ungrouped || row.workspaceId === undefined || row.workspaceId === null) return
        setArchivedWorkspaces((previous) => {
          const next = Object.assign({}, previous, { [row.workspaceId]: true })
          writeStoredMap(ARCHIVED_WORKSPACES_KEY, next)
          return next
        })
      }

      const restoreWorkspace = (workspaceId) => {
        setArchivedWorkspaces((previous) => {
          const next = Object.assign({}, previous)
          delete next[workspaceId]
          writeStoredMap(ARCHIVED_WORKSPACES_KEY, next)
          return next
        })
      }

      const requestArchive = async (session) => {
        if (archiveBusy) return
        setNotice(null)
        setArchiveConfirm(null)
        setArchiveBusy(true)
        try {
          await archiveSession(session.id, { stopActivity: false })
        } catch (error) {
          if (isActiveArchiveRefusal(error)) {
            setArchiveConfirm({ id: session.id, title: session.title.length > 0 ? session.title : tr('unnamedSession') })
          } else {
            setNotice(tr('archive.error', { message: messageOf(error) }))
          }
        } finally {
          setArchiveBusy(false)
        }
      }

      const confirmArchive = async () => {
        if (archiveConfirm === null || archiveBusy) return
        setArchiveBusy(true)
        setNotice(null)
        try {
          await archiveSession(archiveConfirm.id, { stopActivity: true })
          setArchiveConfirm(null)
        } catch (error) {
          setNotice(tr('archive.error', { message: messageOf(error) }))
          setArchiveConfirm(null)
        } finally {
          setArchiveBusy(false)
        }
      }

      const restoreSession = async (sessionId) => {
        if (restoringId !== null) return
        setRestoringId(sessionId)
        setNotice(null)
        try {
          await unarchiveSession(sessionId)
        } catch (error) {
          setNotice(tr('archived.restoreError', { message: messageOf(error) }))
        } finally {
          setRestoringId(null)
        }
      }

      const handleRename = async (workspaceId, title) => {
        setRenamingWorkspace(null)
        setNotice(null)
        try {
          await renameWorkspace(workspaceId, title)
        } catch (error) {
          setNotice(tr('rename.error', { message: messageOf(error) }))
        }
      }

      const handleSessionRename = async (sessionId, title) => {
        setRenamingSession(null)
        setNotice(null)
        try {
          await renameSession(sessionId, title)
        } catch (error) {
          setNotice(tr('renameTask.error', { message: messageOf(error) }))
        }
      }

      const handleAdd = async () => {
        if (adding) return
        setAddError(null)
        setAdding(true)
        try {
          const path = await pickDirectory()
          if (path === undefined) {
            setAddPathOpen(true)
            setAddPathDraft('')
            return
          }
          if (typeof path !== 'string' || path.length === 0) return
          await addWorkspace(path)
        } catch (error) {
          setAddError(tr('addWorkspace.error', { message: messageOf(error) }))
          setAddPathOpen(true)
        } finally {
          setAdding(false)
        }
      }

      const submitAddPath = async () => {
        if (adding) return
        const path = addPathDraft.trim()
        if (path.length === 0) return
        setAdding(true)
        setAddError(null)
        try {
          await addWorkspace(path)
          setAddPathOpen(false)
          setAddPathDraft('')
        } catch (error) {
          setAddError(tr('addWorkspace.error', { message: messageOf(error) }))
        } finally {
          setAdding(false)
        }
      }

      const cancelAddPath = () => {
        if (adding) return
        setAddPathOpen(false)
        setAddPathDraft('')
        setAddError(null)
      }

      if (!wide) {
        return h(
          React.Fragment,
          null,
          h('style', { key: 'wsc-style' }, CSS),
          h(
            'div',
            { className: 'wsc-rail', role: 'group', 'aria-label': tr('title.rail') },
            STATES.map((state) => h(
              'button',
              {
                key: state,
                type: 'button',
                className: 'wsc-rail-btn',
                'data-state': state,
                'data-zero': counts[state] === 0 ? 'true' : 'false',
                title: tr('state.' + state) + ' · ' + counts[state],
                'aria-label': tr('state.' + state) + ' · ' + counts[state],
                onClick: expandSidebar,
              },
              h(StatusIcon, { state, size: 18 }),
              h('span', { className: 'wsc-rail-count' }, String(counts[state])),
            )),
          ),
        )
      }

      const loading = rows.length === 0 && (workspacesState.phase === 'pending' || sessionsState.phase === 'pending')

      let projectContent
      if (loading) {
        projectContent = h('div', { className: 'wsc-empty' }, h('div', { className: 'wsc-empty-hint' }, tr('loading')))
      } else if (queryActive && visibleRows.length === 0) {
        projectContent = h(
          'div',
          { className: 'wsc-empty' },
          h('span', { className: 'wsc-empty-icon' }, h(SearchIcon, { size: 22 })),
          h('div', { className: 'wsc-empty-title' }, tr('search.empty')),
          h('div', { className: 'wsc-empty-hint' }, tr('search.hint')),
          h('button', { type: 'button', className: 'wsc-empty-action', onClick: () => setQuery('') }, tr('search.clear')),
        )
      } else if (visibleRows.length === 0) {
        projectContent = h(
          'div',
          { className: 'wsc-empty' },
          h('div', { className: 'wsc-empty-title' }, tr('empty.title')),
          h('div', { className: 'wsc-empty-hint' }, tr('empty.hint')),
          h('button', { type: 'button', className: 'wsc-empty-action', onClick: handleAdd }, tr('addWorkspace')),
        )
      } else {
        projectContent = h(
          'div',
          { className: 'wsc-scroll' },
          h(
            'div',
            { role: 'list', 'aria-label': tr('title') },
            visibleRows.map((row) => h(WorkspaceEntry, {
              key: row.key,
              row,
              now,
              collapsed: collapsed[row.key] === true,
              doneExpanded: doneExpanded[row.key] === true,
              renaming: renamingWorkspace !== null && renamingWorkspace === row.workspaceId,
              renamingSession,
              busy: archiveBusy,
              currentId,
              onToggle: toggle,
              onToggleDone: toggleDone,
              onOpenSession: openSession,
              onNewSession: startSession,
              onRenameStart: setRenamingWorkspace,
              onRename: handleRename,
              onRenameSessionStart: setRenamingSession,
              onRenameSession: handleSessionRename,
              onArchiveSession: requestArchive,
              onArchiveWorkspace: archiveWorkspace,
              tr,
            })),
          ),
          !queryActive && archivedWorkspaceItems.length > 0
            ? h(ArchivedWorkspacesSection, {
              key: 'archived-workspaces',
              items: archivedWorkspaceItems,
              expanded: archivedWorkspacesOpen,
              onToggle: () => setArchivedWorkspacesOpen((value) => !value),
              onRestore: restoreWorkspace,
              tr,
            })
            : null,
          !queryActive && archivedItems.length > 0
            ? h(ArchivedSection, {
              key: 'archived',
              items: archivedItems,
              expanded: archivedOpen,
              restoringId,
              now,
              onToggle: () => setArchivedOpen((value) => !value),
              onRestore: restoreSession,
              tr,
            })
            : null,
        )
      }

      return h(
        React.Fragment,
        null,
        h('style', { key: 'wsc-style' }, CSS),
        h(
          'div',
          { className: 'wsc-root' },
          h(
            'div',
            { className: 'wsc-head' },
            h(
              'div',
              { className: 'wsc-head-row' },
              h('span', { className: 'wsc-title' }, tr('title')),
              h('span', { className: 'wsc-total' }, tr(queryActive ? 'total.results' : 'total', { n: visibleRows.length })),
              h(
                'button',
                {
                  type: 'button',
                  className: 'wsc-add',
                  title: tr('addWorkspace'),
                  'aria-label': tr('addWorkspace'),
                  disabled: adding,
                  onClick: handleAdd,
                },
                h(PlusIcon, { size: 15 }),
              ),
            ),
            h(
              'div',
              { className: 'wsc-search', role: 'search' },
              h('span', { className: 'wsc-search-icon', 'aria-hidden': 'true' }, h(SearchIcon, { size: 13 })),
              h('input', {
                className: 'wsc-search-input',
                type: 'search',
                value: query,
                placeholder: tr('search.placeholder'),
                'aria-label': tr('search.label'),
                autoComplete: 'off',
                spellCheck: false,
                onChange: (event) => setQuery(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setQuery('')
                  }
                },
              }),
              query.length > 0
                ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'wsc-search-clear',
                    title: tr('search.clear'),
                    'aria-label': tr('search.clear'),
                    onClick: () => setQuery(''),
                  },
                  h(CloseIcon, { size: 11 }),
                )
                : null,
            ),
            h('div', { className: 'wsc-summary' }, STATES.map((state) => h(CountChip, { key: state, state, count: counts[state], tr }))),
          ),
          addPathOpen
            ? h(
              'div',
              { className: 'wsc-add-path', role: 'group', 'aria-label': tr('addWorkspace.pathTitle') },
              h(
                'div',
                { className: 'wsc-add-path-row' },
                h('input', {
                  className: 'wsc-add-path-input',
                  type: 'text',
                  value: addPathDraft,
                  autoFocus: true,
                  placeholder: tr('addWorkspace.pathPlaceholder'),
                  'aria-label': tr('addWorkspace.pathTitle'),
                  disabled: adding,
                  spellCheck: false,
                  onChange: (event) => setAddPathDraft(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelAddPath()
                    } else if (event.key === 'Enter') {
                      event.preventDefault()
                      submitAddPath()
                    }
                  },
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'wsc-rename-save',
                    disabled: adding || addPathDraft.trim().length === 0,
                    onClick: submitAddPath,
                  },
                  tr('addWorkspace.add'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'wsc-rename-cancel',
                    disabled: adding,
                    onClick: cancelAddPath,
                  },
                  tr('addWorkspace.cancel'),
                ),
              ),
              h('div', { className: 'wsc-add-path-hint' }, tr('addWorkspace.pathHint')),
            )
            : null,
          addError === null ? null : h('div', { className: 'wsc-error', role: 'alert' }, addError),
          notice === null ? null : h('div', { className: 'wsc-error', role: 'alert' }, notice),
          archiveConfirm === null
            ? null
            : h(
              'div',
              { className: 'wsc-confirm', role: 'alert', 'aria-label': tr('archive.action') },
              h('div', { className: 'wsc-confirm-text' }, tr('archive.confirm', { name: archiveConfirm.title })),
              h(
                'div',
                { className: 'wsc-confirm-actions' },
                h(
                  'button',
                  { type: 'button', className: 'wsc-confirm-primary', disabled: archiveBusy, onClick: confirmArchive },
                  tr('archive.stop'),
                ),
                h(
                  'button',
                  { type: 'button', className: 'wsc-confirm-secondary', disabled: archiveBusy, onClick: () => setArchiveConfirm(null) },
                  tr('archive.cancel'),
                ),
              ),
            ),
          queryActive
            ? null
            : h(ActiveZone, {
              sessions: activeSessions,
              collapsed: activeCollapsed,
              onToggle: toggleActiveCollapsed,
              now,
              currentId,
              onOpen: openSession,
              tr,
            }),
          h(
            'div',
            { className: 'wsc-zone-head' },
            h('span', { className: 'wsc-active-title' }, tr('title')),
            h('span', { className: 'wsc-total' }, tr(queryActive ? 'total.results' : 'total', { n: visibleRows.length })),
          ),
          projectContent,
        ),
      )
    }

    // ---------------------------------------------------------------------
    // Settings tab
    // ---------------------------------------------------------------------

    function SettingsSection(props) {
      const tr = typeof props.t === 'function' ? props.t : (key) => key
      const [settings, update] = useSettings()
      const [windowDraft, setWindowDraft] = React.useState(String(settings.windowDays))
      const [windowError, setWindowError] = React.useState(null)
      const [resetDone, setResetDone] = React.useState(false)

      const commitWindow = () => {
        const parsed = Number(windowDraft)
        if (!Number.isFinite(parsed) || parsed <= 0) {
          setWindowError(tr('settings.window.invalid'))
          return
        }
        setWindowError(null)
        update({ windowDays: parsed })
      }

      const resetDismissals = () => {
        commitDismissals({})
        setResetDone(true)
        setTimeout(() => setResetDone(false), 2500)
      }

      return h(
        'div',
        { className: 'wsc-settings-root' },
        h('style', { key: 'wsc-settings-style' }, CSS),
        h('div', { className: 'wsc-settings-desc' }, tr('settings.hint')),
        h(
          'div',
          { className: 'wsc-settings-row' },
          h('span', { className: 'wsc-settings-label' }, tr('settings.window')),
          h(
            'div',
            { className: 'wsc-settings-window' },
            h('input', {
              className: 'wsc-settings-input',
              type: 'number',
              min: '1',
              step: '1',
              value: windowDraft,
              onChange: (event) => setWindowDraft(event.target.value),
              onBlur: commitWindow,
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitWindow()
                }
              },
            }),
            h('span', { className: 'wsc-settings-unit' }, tr('settings.windowUnit')),
          ),
          windowError === null ? null : h('span', { className: 'wsc-settings-invalid', role: 'alert' }, windowError),
          h('span', { className: 'wsc-settings-desc' }, tr('settings.windowHint')),
        ),
        h(
          'div',
          { className: 'wsc-settings-row', role: 'radiogroup', 'aria-label': tr('settings.mode') },
          h('span', { className: 'wsc-settings-label' }, tr('settings.mode')),
          h(
            'div',
            { className: 'wsc-settings-modes' },
            h(
              'button',
              {
                type: 'button',
                className: 'wsc-mode',
                role: 'radio',
                'aria-checked': settings.mode === 'a' ? 'true' : 'false',
                'data-checked': settings.mode === 'a' ? 'true' : 'false',
                onClick: () => update({ mode: 'a' }),
              },
              h('span', { className: 'wsc-mode-name' }, h('span', { className: 'wsc-mode-dot' }), tr('settings.modeA')),
              h('span', { className: 'wsc-mode-desc' }, tr('settings.modeADesc')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'wsc-mode',
                role: 'radio',
                'aria-checked': settings.mode === 'b' ? 'true' : 'false',
                'data-checked': settings.mode === 'b' ? 'true' : 'false',
                onClick: () => update({ mode: 'b' }),
              },
              h('span', { className: 'wsc-mode-name' }, h('span', { className: 'wsc-mode-dot' }), tr('settings.modeB')),
              h('span', { className: 'wsc-mode-desc' }, tr('settings.modeBDesc')),
            ),
          ),
        ),
        h(
          'div',
          { className: 'wsc-settings-row' },
          h('span', { className: 'wsc-settings-label' }, tr('settings.reset')),
          h('span', { className: 'wsc-settings-desc' }, tr('settings.resetHint')),
          h(
            'div',
            { className: 'wsc-settings-reset-row' },
            h('button', { type: 'button', className: 'wsc-settings-reset', onClick: resetDismissals }, tr('settings.reset')),
            resetDone ? h('span', { className: 'wsc-settings-saved' }, tr('settings.resetDone')) : null,
          ),
        ),
      )
    }

    // ---------------------------------------------------------------------
    // Plugin
    // ---------------------------------------------------------------------

    /** Crash-attribution-safe wrapper: marks that this entry actually renders. */
    function StatuscardGuarded(props) {
      DEBUG.rendered = true
      return h(CrashTextBoundary, null, h(Statuscard, props))
    }

    const DEBUG = { sidebarRegistered: null, sidebarError: null, rendered: null, crash: null }

    function DiagOverlay(props) {
      const [open, setOpen] = React.useState(false)
      DEBUG.renderedProbe = true
      return h(
        React.Fragment,
        null,
        h(
          'button',
          {
            type: 'button',
            onClick: () => setOpen(true),
            title: 'workspace-statuscard diagnostics',
          },
          DEBUG.crash !== null || DEBUG.sidebarError !== null ? 'SC!' : 'SC',
        ),
        open
          ? h(
            'div',
            {
              onClick: () => setOpen(false),
              style: { position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' },
            },
            h(
              'pre',
              {
                onClick: (event) => event.stopPropagation(),
                style: { background: '#fff', color: '#111', padding: 14, fontSize: 11, lineHeight: 1.5, maxWidth: 460, margin: '70px auto', whiteSpace: 'pre-wrap', borderRadius: 10, maxHeight: '70vh', overflow: 'auto' },
              },
              JSON.stringify(DEBUG, null, 2),
            ),
          )
          : null,
      )
    }

    /** Keep the entry seated on crash: render the error inline instead of abdicating the slot back to the shipped browser. */
    class CrashTextBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }
      static getDerivedStateFromError(error) {
        return { error }
      }
      render() {
        if (this.state.error !== null) {
          DEBUG.crash = String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error) + '\n' + String(this.state.error && this.state.error.stack ? this.state.error.stack : '')
          return h('div', { style: { padding: '8px 10px', fontSize: 11, color: 'var(--dsw-alias-state-error-primary,#e5484d)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, 'statuscard crash:\n' + DEBUG.crash)
        }
        return this.props.children
      }
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'workspace-statuscard: dictionaries')
      remoteRef = ctx.remote
      const t = ctx.locale.bind(NS)

      ctx.slots.inject('sidebar.workspaces', () => {
        try {
          DEBUG.sidebarRegistered = 'registering'
          ctx.slots.register({
            name: 'sidebar.workspaces',
            // The shipped browser sits at priority 0; register() rejects a
            // default-priority collision, and "lowest renders" — an explicit
            // lower value shadows it. Render crashes are kept visible by
            // CrashTextBoundary instead of abdicating back to the shipped UI.
            priority: -1,
            locale: NS,
            inject: () => ({
              openSession: (sessionId) => ctx.uiWorkspace.openSession(sessionId),
              startSession: (workspaceId) => ctx.uiWorkspace.startSession(workspaceId),
              archiveSession: (sessionId, options) => ctx.workspaces.archiveSession(sessionId, options),
              unarchiveSession: (sessionId) => ctx.workspaces.unarchiveSession(sessionId),
              renameWorkspace: (workspaceId, title) => ctx.workspaces.rename(workspaceId, title),
              renameSession: (sessionId, title) => ctx.sessions
                .using(sessionId, { source: 'workspaceOperation' }, (reference) => reference.binding.session.rename(title))
                .then((result) => {
                  if (result === undefined || result === null || result.ok !== true) {
                    throw new Error(result && result.error && result.error.message ? result.error.message : 'Session rename failed')
                  }
                  return result.value
                }),
              addWorkspace: async (path) => {
                if (typeof path !== 'string' || path === '') return null
                await ctx.workspaces.create({ path })
                return path
              },
              pickDirectory: async () => {
                if (typeof window === 'undefined') return undefined
                const desktop = window.__DSH_DIRECTORY_PICKER__
                if (desktop !== undefined && desktop !== null && typeof desktop.pick === 'function') {
                  const result = await desktop.pick()
                  return typeof result === 'string' && result.length > 0 ? result : null
                }
                const legacy = window.__DSH_DESKTOP_PICK_DIRECTORY__
                if (typeof legacy === 'function') {
                  const result = await legacy()
                  return typeof result === 'string' && result.length > 0 ? result : null
                }
                return undefined
              },
            }),
          }, StatuscardGuarded)
          DEBUG.sidebarRegistered = 'ok'
        } catch (error) {
          DEBUG.sidebarRegistered = 'throw'
          DEBUG.sidebarError = String(error && error.message ? error.message : error)
        }
      })

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'workspace-statuscard-diag',
        order: 900,
        locale: NS,
      }, DiagOverlay))

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'workspace-statuscard-tip',
        order: 1001,
        locale: NS,
      }, CardTipOverlay))

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'workspace-statuscard-settings',
        order: 60,
        label: () => t('settings.title'),
        locale: NS,
      }, SettingsSection))
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace', 'workspaces', 'sessions', 'remote'],
      apply,
    }
  },
})
