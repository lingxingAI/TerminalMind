# 插件系统与市场 — 技术研究

> 分支：4-plugin-system  
> 创建日期：2026-03-25

## 研究主题

### 1. Node.js Worker threads 用于扩展隔离

**问题**：如何在 Electron Main 进程中加载第三方扩展逻辑且与宿主内存隔离？

**结论**：

- Node.js `worker_threads` 模块可在独立线程中运行 JavaScript，拥有独立 V8 isolate（与主线程不共享全局对象），适合作为 Phase 4 MVP 的沙箱边界。
- 使用 `new Worker(new URL('./extension-worker.js', import.meta.url), { workerData })` 或等价路径时，需注意 Electron 打包后 `__dirname` 与 `asar` 路径；扩展 Worker 入口建议解压到用户目录（非 asar 内）再加载，避免只读归档限制。
- Worker 内禁止直接 `require` 宿主敏感模块；仅加载扩展 bundle 与极薄的 `worker-bootstrap`，通过 `parentPort` / `MessagePort` 与宿主通信。
- `worker_threads` 不阻止扩展消耗 CPU；若需硬超时，可结合 `worker.terminate()` 与任务队列 watchdog（策略在实现阶段固定）。
- 与 `child_process` 对比：Worker 启动更轻、序列化开销低于部分 IPC 场景，但仍是同一进程内；恶意代码仍可能通过宿主漏洞逃逸，故需配合权限代理而非仅依赖 Worker。

### 2. MessagePort 型 API 代理模式

**问题**：如何让 Worker 中的 `ExtensionWorkerAPI` 调用映射到 Main 中的真实服务？

**结论**：

- 在 Main 与 Worker 之间建立一对 `MessageChannel`，Main 保留 `port1`，Worker 接收 `port2`（通过 `workerData` 传递结构化克隆后的 port，或使用 Node 文档允许的传递方式）。
- 协议采用请求-响应：`ExtensionWorkerMessage` 含 `kind: 'api.invoke'`、`callId`、`namespace`、`method`、`payload`；响应带 `callId` 与 `ok` / `error`。
- 流式能力（如 AI `stream`、终端输出订阅）使用 `kind: 'api.subscribe'` + 增量事件 + `unsubscribe`，或拆分为独立 channel，避免单请求阻塞。
- Main 侧 `ApiGateway` 统一：`permissionManager.check` → 服务委派 → 结果序列化；禁止将函数、类实例、不可克隆对象返回给 Worker。
- 错误映射：内部 `Error` 转为 `{ code, message, details? }` DTO，避免泄露堆栈路径（生产环境可配置日志详细度）。

### 3. 插件 Registry 设计（GitHub Releases + JSON 索引）

**问题**：MVP 如何避免完整 npm registry？

**结论**：

- 在公开 GitHub 仓库中维护 `registry-index.json`（或通过 raw CDN 提供），字段包含：`extensions[]`，每项含 `id`、`name`、`description`、`publisher`、`versions[]`（`version`、`releaseTag`、`tarballUrl`、`integrity`（如 `sha512-...`）、`manifestUrl` 可选）。
- 版本资产托管于 GitHub Releases：每个 tag 上传 `extension-id-version.tgz`，URL 指向 `releases/download` 永久链接。
- 客户端：`IRegistryClient.fetchIndex()` 使用 ETag / `If-None-Match` 缓存；`downloadTarball` 使用流式写入临时文件，完成后哈希校验再解压。
- 可选混合：未来允许 npm 包名作为元数据字段，但 MVP 不要求 `npm install`； tarball 内容仍为扩展根目录（含 `package.json`）。
- 索引签名（可选后续）：使用维护者公钥验证 `index.sig`；Phase 4 可仅依赖 HTTPS + 哈希完整性。

### 4. 权限提示 UX 模式（VS Code、Android）

**问题**：首次授权界面应传达哪些信息以降低误授权？

**结论**：

- **VS Code 模式**：在扩展安装或首次激活敏感能力时展示权限列表；强调「扩展名称 + 发布者 + 请求的权限说明」；提供「允许 / 拒绝 / 查看详情」；拒绝后扩展仍可加载但相关 API 失败（TerminalMind 可采用）。
- **Android 模式**：运行时权限与安装时声明分离；首次使用时弹窗；可在系统设置中撤销——映射到本应用的「扩展管理」里撤销 grant 并触发 `check()` 失败路径。
- 文案：每个 `Permission` 映射简短人类可读描述（中文）与技术 id（英文）并列。
- 避免一次性请求过多权限：可将 `request` 拆批或在 manifest 分层（实现可选优化）。

### 5. 扩展生命周期（install / activate / deactivate / uninstall）

**问题**：状态机如何与 GUI、Worker、磁盘一致？

**结论**：

- **install**：下载 → 校验 → 解压到 `~/.terminalmind/extensions/<id>/<version>/` 或单版本目录 → 写入 `installed.json` 或等价索引。
- **activate**：解析 manifest → 校验 `engines.terminalmind`（若定义）→ 评估 `activationEvents`（启动、`onCommand:*` 等）→ 启动 Worker 或加载内置模块 → 调用 `activate`。
- **deactivate**：取消订阅、dispose Disposable、向 Worker 发 `shutdown` → 等待优雅退出或 `terminate` 超时。
- **uninstall**：先 deactivate → 删除目录 → 更新索引 → 清理 `permissions.json` 中该扩展条目（或保留历史拒绝记录，策略可选）。
- **update**：下载新版本到临时目录，校验后原子替换或切换 symlink（Windows 需注意文件锁，采用临时目录 + 重启后替换策略若需要）。

### 6. Tarball 打包与完整性校验

**问题**：如何防止篡改与损坏包？

**结论**：

- 打包：`npm pack` 或在 CI 中 `tar -czf`，根目录含 `package.json`，`terminalmind.entry` 指向构建产物（如 `dist/index.js`）。
- 哈希：在索引中存放 `integrity`，格式遵循 Subresource Integrity（`sha512-base64`）或十六进制一致约定；下载后 `crypto.createHash('sha512')` 对流校验。
- **zip slip 防护**：解压时规范化目标路径，拒绝 `..` 与绝对路径；所有文件必须位于目标扩展根下。
- 可选：`manifest.json` 与包内 `package.json` 交叉验证 `version` 字段。
