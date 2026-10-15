import type { PageContent, PageStatus, PublicBrand, Role, SessionUser, Theme } from '../contracts';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageListItem {
  id: string;
  slug: string;
  title: string;
  status: PageStatus;
  draftVersion: number;
  publishedVersion: number | null;
  publishedAt: string | null;
  updatedAt: string;
  pageUrl: string;
  liveUrl: string | null;
  occasion: { id: string; name: string; slug: string };
  updatedBy: { name: string } | null;
}

export interface PageDetail {
  id: string;
  slug: string;
  title: string;
  occasionId: string;
  status: PageStatus;
  draft: PageContent;
  draftVersion: number;
  publishedVersion: number | null;
  publishedAt: string | null;
  updatedAt: string;
  hasUnpublishedChanges: boolean;
  pageUrl: string;
  liveUrl: string | null;
}

export interface Revision {
  id: string;
  version: number;
  kind: 'SAVE' | 'PUBLISH' | 'RESTORE';
  title: string;
  slug: string;
  note: string;
  createdAt: string;
  createdBy: { name: string } | null;
}

export interface Brand extends PublicBrand {
  isActive: boolean;
  /** The brand's id at GyFTR; null for a brand added by hand in the panel. */
  gyftrId: number | null;
  /** Fields changed by hand; the GyFTR sync leaves them alone. */
  manualFields: string[];
  /** Last time the brand's data came from GyFTR. */
  syncedAt: string | null;
  updatedAt: string;
}

/** The brand sync from GyFTR (runs after each sign-in and on demand). */
export interface BrandSyncStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  result: { listed: number; created: number; updated: number; unchanged: number; deactivated: number; detailsFailed: number } | null;
  error: string | null;
}

export interface Media {
  id: string;
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  originalName: string;
  alt: string;
  createdAt: string;
}

export interface Occasion {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  recipients: string;
  emoji: string;
  pageUrl: string;
  sortOrder: number;
  isActive: boolean;
  theme: Theme;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  occasionId: string | null;
  createdAt: string;
}

export interface User extends SessionUser {
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  actor: { name: string; email: string } | null;
}

export interface AppConfig {
  publicBaseUrl: string;
}

export type { Role };
