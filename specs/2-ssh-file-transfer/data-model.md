# SSH & 文件传输 — 数据模型

> 分支：2-ssh-file-transfer
> 创建日期：2026-03-25

## 核心实体

### SSHConnectionConfig

SSH 连接配置，描述如何连接到远程服务器。

```typescript
interface SSHConnectionConfig {
  readonly host: string;
  readonly port: number;                          // 默认 22
  readonly username: string;
  readonly auth: SSHAuthMethod;
  readonly jumpHosts?: readonly SSHConnectionConfig[];
  readonly keepAliveInterval?: number;            // 毫秒，默认 30000
  readonly readyTimeout?: number;                 // 连接超时毫秒，默认 10000
}

type SSHAuthMethod =
  | { readonly type: 'password'; readonly password: string }
  | { readonly type: 'publicKey'; readonly privateKeyPath: string; readonly passphrase?: string }
  | { readonly type: 'agent' };
```

### SSHSession

SSH 活跃连接会话。

```typescript
interface SSHSession {
  readonly id: string;
  readonly config: Readonly<SSHConnectionConfig>;
  readonly status: 'connecting' | 'connected' | 'disconnected' | 'error';
  readonly connectedAt?: number;
  readonly error?: string;

  shell(): Promise<TerminalSession>;
  exec(command: string): Promise<ExecResult>;
  forwardPort(options: Readonly<PortForwardOptions>): Promise<PortForward>;
  sftp(): Promise<SFTPChannel>;
  disconnect(): Promise<void>;
}

interface ExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface PortForwardOptions {
  readonly localPort: number;
  readonly remoteHost: string;                    // 默认 'localhost'
  readonly remotePort: number;
}

interface PortForward {
  readonly id: string;
  readonly localPort: number;
  readonly remoteHost: string;
  readonly remotePort: number;
  close(): Promise<void>;
}
```

### SFTPChannel

SFTP 文件操作通道，从 SSHSession 获取。

```typescript
interface SFTPChannel {
  readonly sessionId: string;

  list(remotePath: string): Promise<readonly FileEntry[]>;
  stat(remotePath: string): Promise<FileStat>;
  mkdir(remotePath: string): Promise<void>;
  rmdir(remotePath: string): Promise<void>;
  unlink(remotePath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  upload(localPath: string, remotePath: string, options?: Readonly<TransferOptions>): Promise<TransferResult>;
  download(remotePath: string, localPath: string, options?: Readonly<TransferOptions>): Promise<TransferResult>;

  readonly onProgress: Event<TransferProgress>;
}

interface FileEntry {
  readonly filename: string;
  readonly longname: string;
  readonly attrs: FileStat;
}

interface FileStat {
  readonly size: number;
  readonly mode: number;
  readonly uid: number;
  readonly gid: number;
  readonly atime: number;
  readonly mtime: number;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly isSymbolicLink: boolean;
}

interface TransferOptions {
  readonly concurrency?: number;                  // 默认 64
  readonly chunkSize?: number;                    // 默认 32768
}

interface TransferResult {
  readonly success: boolean;
  readonly bytesTransferred: number;
  readonly durationMs: number;
}

interface TransferProgress {
  readonly transferId: string;
  readonly filename: string;
  readonly direction: 'upload' | 'download';
  readonly bytesTransferred: number;
  readonly totalBytes: number;
  readonly percentage: number;
}
```

### ConnectionProfile

连接配置持久化实体，保存在 `~/.terminalmind/connections.json`。

```typescript
interface ConnectionProfile {
  readonly id: string;                            // UUID
  readonly name: string;                          // 用户可见名称
  readonly type: 'ssh' | 'local';
  readonly group?: string;                        // 分组名称
  readonly tags?: readonly string[];
  readonly sshConfig?: Readonly<SSHConnectionConfig>;
  readonly terminalConfig?: Readonly<TerminalCreateOptions>;
  readonly createdAt: number;
  readonly updatedAt: number;
}
```

注意：`sshConfig.auth` 中的 `password` 和 `passphrase` 不持久化到 JSON 文件。这些敏感字段在保存时被移除，实际值存储在系统 Keychain 中。加载时从 Keychain 读取并填充回对象。

### ConnectionStore

连接配置存储接口。

```typescript
interface IConnectionStore {
  list(): Promise<readonly ConnectionProfile[]>;
  get(id: string): Promise<ConnectionProfile | undefined>;
  save(profile: Readonly<ConnectionProfile>): Promise<void>;
  remove(id: string): Promise<void>;
  import(source: string, format: 'json'): Promise<readonly ConnectionProfile[]>;
  export(ids: readonly string[], format: 'json'): Promise<string>;

  readonly onChange: Event<ConnectionStoreChangeEvent>;
}

interface ConnectionStoreChangeEvent {
  readonly type: 'added' | 'updated' | 'removed';
  readonly profileId: string;
}
```

### HostKeyStore

SSH 主机密钥存储。

```typescript
interface IHostKeyStore {
  lookup(host: string, port: number): Promise<HostKeyEntry | undefined>;
  save(entry: Readonly<HostKeyEntry>): Promise<void>;
  remove(host: string, port: number): Promise<void>;
}

interface HostKeyEntry {
  readonly host: string;
  readonly port: number;
  readonly algorithm: string;
  readonly fingerprint: string;                   // SHA-256 hex
  readonly addedAt: number;
}
```

### TransferQueue

SFTP 传输队列管理。

```typescript
interface TransferTask {
  readonly id: string;
  readonly sshSessionId: string;
  readonly direction: 'upload' | 'download';
  readonly localPath: string;
  readonly remotePath: string;
  readonly status: 'queued' | 'transferring' | 'completed' | 'failed';
  readonly progress: number;                      // 0-100
  readonly bytesTransferred: number;
  readonly totalBytes: number;
  readonly error?: string;
  readonly startedAt?: number;
  readonly completedAt?: number;
}

interface ITransferQueue {
  enqueue(task: Omit<TransferTask, 'id' | 'status' | 'progress' | 'bytesTransferred' | 'totalBytes'>): string;
  cancel(taskId: string): void;
  retry(taskId: string): void;
  listTasks(): readonly TransferTask[];
  clearCompleted(): void;

  readonly onTaskUpdate: Event<TransferTask>;
}
```

## 存储结构

### ~/.terminalmind/connections.json

```json
{
  "version": 1,
  "profiles": [
    {
      "id": "uuid-1",
      "name": "Production Web Server",
      "type": "ssh",
      "group": "Production",
      "tags": ["web", "nginx"],
      "sshConfig": {
        "host": "192.168.1.100",
        "port": 22,
        "username": "deploy",
        "auth": { "type": "publicKey", "privateKeyPath": "~/.ssh/id_ed25519" },
        "keepAliveInterval": 30000
      },
      "createdAt": 1711296000000,
      "updatedAt": 1711296000000
    }
  ]
}
```

### ~/.terminalmind/known_hosts

```
192.168.1.100:22 ssh-ed25519 SHA256:AbCdEfGhIjKlMnOpQrStUvWxYz1234567890abcdef
10.0.0.1:22 ssh-rsa SHA256:XyZaBcDeFgHiJkLmNoPqRsTuVwXyZ0987654321fedcba
```

### Keychain 存储键名约定

- Service: `terminalmind`
- Account 格式: `connection:<profileId>:password` 或 `connection:<profileId>:passphrase`
- 值: 对应的明文密码或密钥密码

## 事件类型扩展

Phase 2 新增的 EventBus 事件类型：

```typescript
interface EventPayloadMap {
  // Phase 1 已有
  'terminal.created': { sessionId: string; title: string };
  'terminal.exited': { sessionId: string; exitCode: number };
  'terminal.destroyed': { sessionId: string };

  // Phase 2 新增
  'ssh.connecting': { sessionId: string; host: string };
  'ssh.connected': { sessionId: string; host: string };
  'ssh.disconnected': { sessionId: string; host: string; reason?: string };
  'ssh.error': { sessionId: string; host: string; error: string };
  'ssh.hostKeyNew': { host: string; port: number; fingerprint: string };
  'ssh.hostKeyChanged': { host: string; port: number; oldFingerprint: string; newFingerprint: string };
  'sftp.transferStart': { transferId: string; direction: 'upload' | 'download'; filename: string };
  'sftp.transferProgress': TransferProgress;
  'sftp.transferComplete': { transferId: string; success: boolean; error?: string };
  'connection.changed': ConnectionStoreChangeEvent;
}
```
