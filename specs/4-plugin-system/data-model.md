# 插件系统与市场 — 数据模型

> 分支：4-plugin-system  
> 创建日期：2026-03-25

## 核心实体

### ExtensionManifest（完整 `terminalmind` 字段）

`package.json` 中的 `terminalmind` 对象，与实现解析器一致。

```typescript
type ActivationEvent =
  | '*'
  | `onStartup`
  | `onCommand:${string}`
  | `onView:${string}`;

type Permission =
  | 'terminal.execute'
  | 'connections.read'
  | 'connections.write'
  | 'fs.read'
  | 'fs.write'
  | 'ai.invoke'
  | 'network.outbound';

interface MenuContribution {
  readonly command: string;
  readonly when?: string;
  readonly group?: string;
}

interface KeybindingContribution {
  readonly command: string;
  readonly key: string;
  readonly when?: string;
  readonly mac?: string;
}

interface ConfigurationContribution {
  readonly title: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

/** 与 Phase 1 `CommandContribution` 一致 */
interface CommandContribution {
  readonly command: string;
  readonly title: string;
  readonly category?: string;
}

/** 与 Phase 1 `ViewContribution` 一致；location 枚举可随 Phase 4 扩展 */
interface ViewContribution {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly location: 'sidebar' | 'panel' | 'statusBar';
}

interface ExtensionContributions {
  readonly commands?: readonly CommandContribution[];
  readonly views?: readonly ViewContribution[];
  readonly menus?: readonly MenuContribution[];
  readonly keybindings?: readonly KeybindingContribution[];
  readonly configuration?: readonly ConfigurationContribution[];
}

interface ExtensionManifest {
  readonly entry: string;
  readonly activationEvents: readonly ActivationEvent[];
  readonly permissions: readonly Permission[];
  readonly contributes: ExtensionContributions;
}
```

> `CommandContribution` / `ViewContribution` 与 Phase 1 契约对齐；若 Phase 4 扩展 `location` 枚举（如 `statusBar`），以实现为准并回写契约。

### InstalledExtension

磁盘上已安装扩展的运行时元数据（可由 `installed.json` 索引多条）。

```typescript
type ExtensionSource = 'builtin' | 'marketplace' | 'local';

interface InstalledExtension {
  readonly id: string;
  readonly version: string;
  readonly source: ExtensionSource;
  readonly rootPath: string;
  readonly manifest: ExtensionManifest;
  readonly enabled: boolean;
  readonly installedAt: number;
  readonly updatedAt: number;
  readonly publisher?: string;
  readonly integrity?: string;
}
```

### PermissionGrant

某扩展已授予权限集合，持久化于 `permissions.json`。

```typescript
interface PermissionGrant {
  readonly extensionId: string;
  readonly granted: ReadonlySet<Permission>;
  readonly updatedAt: number;
}
```

### PermissionPrompt

Renderer 展示的待授权会话对象（内存实体，可不单独落盘）。

```typescript
interface PermissionPrompt {
  readonly promptId: string;
  readonly extensionId: string;
  readonly extensionDisplayName: string;
  readonly requested: readonly Permission[];
  readonly rationale?: string;
}
```

### RegistryEntry

索引中单条扩展的聚合信息。

```typescript
interface RegistryExtensionVersion {
  readonly version: string;
  readonly releaseTag: string;
  readonly tarballUrl: string;
  readonly integrity: string;
  readonly publishedAt: string;
}

interface RegistryEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly publisher: string;
  readonly repositoryUrl?: string;
  readonly license?: string;
  readonly versions: readonly RegistryExtensionVersion[];
  readonly tags?: readonly string[];
}
```

### RegistrySearchResult

市场搜索返回的列表项（可为 `RegistryEntry` 子集 + 高亮字段）。

```typescript
interface RegistrySearchResult {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly publisher: string;
  readonly latestVersion: string;
  readonly tags?: readonly string[];
}
```

### ExtensionWorkerMessage（协议）

Main ↔ Worker 消息 envelope。具体变体在 `contracts/extension-host.ts` 以 discriminated union 精化。

```typescript
type ExtensionWorkerMessageKind =
  | 'worker.ready'
  | 'worker.error'
  | 'api.invoke'
  | 'api.response'
  | 'api.event'
  | 'lifecycle.shutdown';

interface ExtensionWorkerMessageBase {
  readonly kind: ExtensionWorkerMessageKind;
}

/** 示例：API 调用（Worker → Main） */
interface ApiInvokeMessage extends ExtensionWorkerMessageBase {
  readonly kind: 'api.invoke';
  readonly callId: string;
  readonly extensionId: string;
  readonly namespace: string;
  readonly method: string;
  readonly payload: unknown;
}

/** 示例：API 响应（Main → Worker） */
interface ApiResponseMessage extends ExtensionWorkerMessageBase {
  readonly kind: 'api.response';
  readonly callId: string;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
}
```

## 存储布局

| 路径 | 用途 |
|---|---|
| `~/.terminalmind/extensions/` | 已安装扩展根目录，每扩展子目录含 `package.json` 与构建产物 |
| `~/.terminalmind/extensions/installed.json` | 已安装扩展索引（`InstalledExtension[]` 或 id → 记录） |
| `~/.terminalmind/extensions/permissions.json` | `PermissionGrant[]` 或 id → `granted[]` |
| `~/.terminalmind/cache/registry-index.json` | 上次成功拉取的索引缓存（含 `fetchedAt`、`etag`） |

## EventPayloadMap 扩展（建议）

以下事件名称为建议字符串，实现时与 `@terminalmind/core` 中 `EventType` 合并。

| 事件类型 | 载荷 | 说明 |
|---|---|---|
| `extension.installed` | `{ extensionId, version }` | 安装完成 |
| `extension.uninstalled` | `{ extensionId }` | 卸载完成 |
| `extension.updated` | `{ extensionId, fromVersion, toVersion }` | 更新完成 |
| `extension.activated` | `{ extensionId }` | 激活完成 |
| `extension.deactivated` | `{ extensionId }` | 停用完成 |
| `extension.workerCrashed` | `{ extensionId, reason? }` | Worker 异常退出 |
| `permission.requested` | `PermissionPrompt` | 待用户响应 |
| `permission.changed` | `PermissionGrant` | 授权集合变更 |
| `marketplace.indexRefreshed` | `{ count: number }` | 索引刷新 |
| `marketplace.installProgress` | `{ extensionId, phase, percent? }` | 安装进度（可选） |

## 与 package.json 合并字段

解析时除 `terminalmind` 外还需读取：

- `name`（作为 npm 包名，可能与市场 `id` 映射）
- `version`（SemVer）
- `publisher`（若顶层无，可用 `repository` 推断或留空）

## 校验规则（摘要）

- `entry` 必须存在于包内相对路径  
- `permissions` 必须是已知 `Permission` 枚举子集  
- `activationEvents` 非空或允许默认 `onStartup`（实现选定）  
- `integrity` 与下载 tarball 校验失败则拒绝安装  
