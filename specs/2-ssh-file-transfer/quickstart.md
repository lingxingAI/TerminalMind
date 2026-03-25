# SSH & 文件传输 — 快速启动

> 分支：2-ssh-file-transfer
> 创建日期：2026-03-25

## 前置条件

### 已有基础（Phase 1 已完成）

- Monorepo 结构（packages/core、services、api、app + extensions/）
- Core CLI 基础设施（CommandRegistry、ServiceContainer、EventBus）
- Extension API 最小子集（activate/deactivate、commands.register、views.registerSidebarView）
- TerminalService + ext-terminal（本地多标签终端）
- GUI Shell 布局（ActivityBar、Sidebar、TabBar、TerminalView、PanelArea、StatusBar）
- IPC Bridge（Renderer ↔ Main 进程通信）
- 构建工具链（electron-vite + electron-builder）
- 单元测试基础设施（Vitest）

### 新增依赖安装

```bash
# 在 packages/services 中安装 ssh2
cd packages/services
pnpm add ssh2
pnpm add -D @types/ssh2

# 在项目根目录安装 keytar（原生模块）
cd packages/services
pnpm add keytar

# 重建原生模块（在 packages/app 中执行）
cd packages/app
npx @electron/rebuild -w keytar
```

### 开发测试准备

为了测试 SSH 连接，需要一个可达的 SSH 服务器。推荐方式：

1. **本地 Docker**（推荐）：
   ```bash
   docker run -d -p 2222:22 --name test-ssh lscr.io/linuxserver/openssh-server:latest \
     -e PASSWORD_ACCESS=true -e USER_PASSWORD=test -e USER_NAME=testuser
   ```

2. **本地 WSL**（Windows 用户）：
   ```bash
   # 在 WSL 中启动 sshd
   sudo service ssh start
   # 从 Windows 连接到 localhost:22
   ```

3. **远程服务器**：使用已有的测试/开发服务器

## 新增包结构

```
packages/services/src/
├── ssh/
│   ├── ssh-service.ts           # ISSHService 实现
│   ├── ssh-session.ts           # ManagedSSHSession 实现
│   ├── host-key-store.ts        # IHostKeyStore 实现
│   ├── __tests__/
│   │   ├── ssh-service.test.ts
│   │   └── host-key-store.test.ts
│   └── index.ts
├── sftp/
│   ├── sftp-channel.ts          # SFTPChannel 实现
│   ├── transfer-queue.ts        # ITransferQueue 实现
│   ├── __tests__/
│   │   ├── transfer-queue.test.ts
│   │   └── sftp-channel.test.ts
│   └── index.ts
├── connection/
│   ├── connection-store.ts      # IConnectionStore 实现
│   ├── secret-store.ts          # ISecretStore 实现（keytar wrapper）
│   ├── __tests__/
│   │   └── connection-store.test.ts
│   └── index.ts
└── ...（Phase 1 已有模块）

extensions/
├── ext-ssh/
│   ├── package.json
│   ├── src/index.ts
│   └── tsconfig.json
├── ext-sftp/
│   ├── package.json
│   ├── src/index.ts
│   └── tsconfig.json
├── ext-connections/
│   ├── package.json
│   ├── src/index.ts
│   └── tsconfig.json
└── ext-terminal/（Phase 1 已有）

packages/app/src/renderer/src/
├── components/
│   ├── ssh/
│   │   └── ConnectionForm.tsx     # SSH 连接配置表单
│   ├── sftp/
│   │   ├── FileBrowser.tsx        # 双面板文件浏览器
│   │   ├── FileTree.tsx           # 文件树组件
│   │   └── TransferQueue.tsx      # 传输队列面板
│   ├── connections/
│   │   ├── ConnectionTree.tsx     # 侧边栏连接树
│   │   └── ConnectionEditor.tsx   # 连接编辑器
│   └── ...（Phase 1 已有组件）
├── stores/
│   ├── connection-store.ts        # 连接状态 Zustand store
│   ├── transfer-store.ts          # 传输状态 Zustand store
│   └── ...（Phase 1 已有 stores）
└── ...
```

## 关键实现路径

### 数据流：SSH 连接

```
用户双击连接 → ConnectionTree.tsx
  → window.api.ssh.connect(profileId)
  → IPC → Main Process
  → SSHService.connect(config)
  → ssh2 Client.connect()
  → 'ready' 事件
  → SSHSession.shell()
  → ssh2 Client.shell()
  → TerminalSession（复用 Phase 1 接口）
  → IPC send PTY_DATA
  → Renderer TerminalView.tsx 渲染
```

### 数据流：SFTP 文件传输

```
用户拖拽文件到远程目录 → FileBrowser.tsx
  → window.api.sftp.upload(sshSessionId, localPath, remotePath)
  → IPC → Main Process
  → SSHSession.sftp()
  → SFTPChannel.upload(localPath, remotePath)
  → ssh2 fastPut()
  → onProgress 事件 → IPC push → TransferQueue.tsx 更新
  → 传输完成 → IPC push → FileBrowser.tsx 刷新
```

### 数据流：连接配置保存

```
用户填写表单 → ConnectionEditor.tsx
  → window.api.connections.save(profile)
  → IPC → Main Process
  → ConnectionStore.save(profile)
  → 分离敏感信息 → SecretStore.set(key, password)
  → 写入 connections.json（无明文密码）
  → EventBus emit 'connection.changed'
  → IPC push → ConnectionTree.tsx 刷新
```

## 开发命令

```bash
# 安装全部依赖
pnpm install

# 重建原生模块
pnpm rebuild:native

# 运行测试（纯 Node.js，无需 Electron）
pnpm test

# 启动开发模式
pnpm dev

# TypeScript 类型检查
pnpm typecheck

# 代码格式化和检查
pnpm lint && pnpm format
```

## 验证检查点

1. **SSH 连接**：`pnpm test` 中 SSHService 单元测试全部通过（使用 mock ssh2 client）
2. **SFTP 操作**：SFTPChannel 单元测试覆盖 list/upload/download/delete
3. **连接管理**：ConnectionStore 单元测试覆盖 CRUD + 导入导出
4. **端到端**：`pnpm dev` 启动后，在 GUI 中成功连接到测试 SSH 服务器并执行命令
5. **文件传输**：通过 SFTP 面板成功上传和下载文件
6. **安全性**：`connections.json` 中无明文密码
