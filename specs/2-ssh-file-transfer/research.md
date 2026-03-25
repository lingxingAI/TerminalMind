# SSH & 文件传输 — 技术研究

> 分支：2-ssh-file-transfer
> 创建日期：2026-03-25

## 研究主题

### 1. ssh2 库架构与 API 模式

**问题**：ssh2 的连接生命周期、流式 Shell 获取、SFTP 子系统打开方式？

**结论**：
- `ssh2` 的 `Client` 类是核心。调用 `client.connect(config)` 建立连接，监听 `'ready'` 事件后可执行操作。
- Shell 会话通过 `client.shell(options, callback)` 获取 `stream` 对象，该 stream 是双工流（Readable + Writable），与 xterm.js 数据流对接方式和 node-pty 类似。
- SFTP 通道通过 `client.sftp(callback)` 获取 `SFTPWrapper` 对象，提供 `readdir`、`fastGet`、`fastPut`、`mkdir`、`unlink`、`rename`、`stat` 等方法。
- 多跳跳板机实现：先建立到跳板机的连接，通过 `client.forwardOut(srcIP, srcPort, dstIP, dstPort, callback)` 获取一个到目标地址的 TCP stream，将该 stream 作为第二个 `client.connect()` 的 `sock` 参数。
- 端口转发使用 `client.forwardOut()` 实现本地转发，需在本地创建 `net.Server` 监听指定端口，每个入站连接通过 `forwardOut` 建立隧道。
- 认证方式支持：`password`（密码字段）、`privateKey`（Buffer/string）+ `passphrase`（可选）、`agent`（SSH Agent socket 路径）。
- keepAlive 通过 `keepaliveInterval` 和 `keepaliveCountMax` 配置项控制。

### 2. 系统 Keychain 集成方案

**问题**：如何跨平台安全存储敏感信息（密码、密钥密码、API Key）？

**结论**：
- `keytar` 是 Electron/Atom 生态中最成熟的跨平台 Keychain 库。
- 支持 macOS Keychain、Windows Credential Manager、Linux libsecret（GNOME Keyring / KDE Wallet）。
- API 简单：`setPassword(service, account, password)`、`getPassword(service, account)`、`deletePassword(service, account)`。
- 使用 `service = 'terminalmind'`，`account = connectionId` 作为键。
- 原生模块，需要 `@electron/rebuild` 重建。
- Linux 需要用户安装 `libsecret-1-dev`（Ubuntu/Debian）或 `libsecret-devel`（Fedora），如果缺失应提供优雅降级方案。
- 降级方案：当 keytar 不可用时，使用基于 `crypto.createCipheriv()` 的加密文件存储（`~/.terminalmind/vault.enc`），以机器唯一标识作为密钥派生源。

### 3. SSH 主机密钥验证

**问题**：如何实现 known_hosts 管理和主机密钥验证？

**结论**：
- ssh2 在 `client.connect()` 配置中可通过 `hostVerifier` 回调实现自定义验证。
- 回调签名：`hostVerifier(key: Buffer, verify: () => void)` — 调用 `verify()` 接受，不调用则拒绝。
- 自行维护 `~/.terminalmind/known_hosts` 文件，格式为 `hostname algorithm fingerprint`（简化版）。
- 首次连接：提示用户确认主机指纹，确认后写入 known_hosts。
- 已知主机：对比指纹，匹配则自动通过。
- 指纹变更：显示安全警告，要求用户主动确认是否更新。
- 指纹算法使用 SHA-256 哈希。

### 4. SFTP 传输性能优化

**问题**：如何提高 SFTP 文件传输速率？

**结论**：
- ssh2 提供 `fastGet` 和 `fastPut` 方法，支持并行分块传输（`concurrency` 和 `chunkSize` 参数）。
- 默认 `concurrency: 64`、`chunkSize: 32768` 已较优。
- 进度回调通过 `step` 选项获取：`step(transferred, chunk, total)` — 可用于计算传输百分比和速率。
- 传输队列可使用简单的 FIFO 队列 + 并发控制器（concurrency limiter）实现。
- 单个 SFTP 通道支持并发操作，无需每次传输新建通道。

### 5. IPC 架构扩展策略

**问题**：如何在不破坏 Phase 1 IPC 架构的前提下扩展 SSH/SFTP IPC 通道？

**结论**：
- Phase 1 已建立 `IpcChannels`（request-response）和 `IpcEventChannels`（one-way events）常量模式。
- 新增 SSH/SFTP 通道只需在 `packages/api/src/ipc/channels.ts` 中追加常量。
- SSH 连接生命周期事件（connected/disconnected/error）通过 `IpcEventChannels` 广播到 Renderer。
- SFTP 传输进度通过 `IpcEventChannels` 持续推送。
- SSH Shell 数据流复用 Phase 1 已有的 PTY_DATA 通道模式（sessionId 区分本地/远程会话）。
- 新增类型定义在 `packages/api/src/ipc/types.ts` 中扩展。

### 6. Extension API 扩充范围

**问题**：Phase 2 需要扩充哪些 Extension API 命名空间？

**结论**：
- `connections` 命名空间（新增）：`connections.list()`、`connections.get(id)`、`connections.save(profile)`、`connections.remove(id)`、`connections.onChange(handler)`
- `terminal` 命名空间（增强）：`terminal.createSSH(connectionId)` — 基于已保存连接创建 SSH 终端
- `events` 命名空间（增强）：新增事件类型 `ssh.connected`、`ssh.disconnected`、`ssh.error`、`sftp.transferProgress`、`sftp.transferComplete`
- 这些 API 方法在 `TerminalMindAPI` 上注册，ext-ssh/ext-sftp/ext-connections 通过标准 `activate(ctx, api)` 方式使用。
