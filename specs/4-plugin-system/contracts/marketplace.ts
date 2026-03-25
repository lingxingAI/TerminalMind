/**
 * Phase 4 — 插件市场服务与 Registry 客户端契约
 */

import type { InstalledExtension } from './extension-host';

// ─── 搜索与详情 ────────────────────────────────────────────

export interface SearchQuery {
  readonly text?: string;
  readonly tags?: readonly string[];
  readonly publisher?: string;
  /** 分页 */
  readonly offset?: number;
  readonly limit?: number;
}

export interface MarketplaceEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly publisher: string;
  readonly latestVersion: string;
  readonly tags?: readonly string[];
  readonly repositoryUrl?: string;
  readonly license?: string;
}

export interface SearchResult {
  readonly total: number;
  readonly items: readonly MarketplaceEntry[];
}

export interface ExtensionDetails extends MarketplaceEntry {
  readonly versions: readonly MarketplaceVersionInfo[];
  readonly readme?: string;
}

export interface MarketplaceVersionInfo {
  readonly version: string;
  readonly tarballUrl: string;
  readonly integrity: string;
  readonly publishedAt: string;
  readonly releaseTag: string;
}

// ─── IRegistryClient ───────────────────────────────────────

export interface RegistryIndex {
  readonly indexVersion: number;
  readonly generatedAt: string;
  readonly extensions: readonly RegistryExtensionRecord[];
}

export interface RegistryExtensionRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly publisher: string;
  readonly tags?: readonly string[];
  readonly repositoryUrl?: string;
  readonly license?: string;
  readonly versions: readonly MarketplaceVersionInfo[];
}

export interface DownloadOptions {
  readonly expectedIntegrity: string;
  readonly signal?: AbortSignal;
}

export interface IRegistryClient {
  fetchIndex(): Promise<RegistryIndex>;
  /** 流式下载到临时路径由实现完成，返回解压就绪的包目录或 tgz 路径 */
  downloadTarball(
    url: string,
    options: DownloadOptions
  ): Promise<{ readonly localPath: string }>;
}

// ─── IMarketplaceService ───────────────────────────────────

export interface InstallOptions {
  readonly version?: string;
}

export interface UpdateOptions {
  readonly targetVersion?: string;
}

export interface IMarketplaceService {
  search(query: SearchQuery): Promise<SearchResult>;
  getDetails(extensionId: string): Promise<ExtensionDetails | null>;
  install(extensionId: string, options?: InstallOptions): Promise<InstalledExtension>;
  uninstall(extensionId: string): Promise<void>;
  update(extensionId: string, options?: UpdateOptions): Promise<InstalledExtension>;
  listInstalled(): Promise<readonly InstalledExtension[]>;
  /** 刷新本地缓存的 Registry 索引 */
  refreshIndex(): Promise<void>;
}
