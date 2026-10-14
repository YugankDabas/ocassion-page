import type { BrandInput, PageStatus, PublicBrand, RedemptionMode, Role } from '../contracts';
import type { PageSeo } from '../render/seo';

/* Persistence ports. Services depend on these interfaces only (DIP); the
 * Prisma implementations live next door and are wired in container.ts.
 * Tests swap in in-memory fakes. */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/* ---------- Users ---------- */
export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  tokenVersion: number;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface IUserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  list(): Promise<UserRecord[]>;
  create(data: { email: string; name: string; role: Role; passwordHash: string; mustChangePassword: boolean }): Promise<UserRecord>;
  update(
    id: string,
    data: Partial<Pick<UserRecord, 'name' | 'role' | 'isActive' | 'passwordHash' | 'mustChangePassword'>> & { bumpTokenVersion?: boolean },
  ): Promise<UserRecord>;
  touchLogin(id: string): Promise<void>;
  countActiveAdmins(): Promise<number>;
}

/* ---------- Occasions ---------- */
export interface OccasionRecord {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  recipients: string;
  emoji: string;
  pageUrl: string;
  sortOrder: number;
  isActive: boolean;
  theme: unknown;
}

export interface IOccasionRepository {
  list(): Promise<OccasionRecord[]>;
  findById(id: string): Promise<OccasionRecord | null>;
  findBySlug(slug: string): Promise<OccasionRecord | null>;
  create(data: Omit<OccasionRecord, 'id'>): Promise<OccasionRecord>;
  update(id: string, data: Partial<Omit<OccasionRecord, 'id'>>): Promise<OccasionRecord>;
}

/* ---------- Templates ---------- */
export interface TemplateRecord {
  id: string;
  name: string;
  description: string;
  occasionId: string | null;
  content: unknown;
  createdAt: Date;
}

export interface ITemplateRepository {
  list(occasionId?: string): Promise<TemplateRecord[]>;
  findById(id: string): Promise<TemplateRecord | null>;
  create(data: Omit<TemplateRecord, 'id' | 'createdAt'> & { createdById: string }): Promise<TemplateRecord>;
  delete(id: string): Promise<void>;
}

/* ---------- Pages ---------- */
export interface PageRecord {
  id: string;
  slug: string;
  title: string;
  occasionId: string;
  status: PageStatus;
  draft: unknown;
  draftVersion: number;
  published: unknown | null;
  publishedVersion: number | null;
  publishedSlug: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PageListItem {
  id: string;
  slug: string;
  title: string;
  status: PageStatus;
  draftVersion: number;
  publishedVersion: number | null;
  publishedSlug: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  occasion: { id: string; name: string; slug: string };
  updatedBy: { name: string } | null;
}

export interface RevisionRecord {
  id: string;
  pageId: string;
  version: number;
  kind: 'SAVE' | 'PUBLISH' | 'RESTORE';
  title: string;
  slug: string;
  content: unknown;
  note: string;
  createdAt: Date;
  createdBy: { name: string } | null;
}

export type NewRevision = Omit<RevisionRecord, 'id' | 'createdAt' | 'createdBy'> & { createdById: string };

export interface IPageRepository {
  findById(id: string): Promise<PageRecord | null>;
  findBySlug(slug: string): Promise<PageRecord | null>;
  findByPublishedSlug(slug: string): Promise<PageRecord | null>;
  list(filter: { status?: PageStatus; occasionId?: string; search?: string }): Promise<PageListItem[]>;
  listPublished(): Promise<PageRecord[]>;
  create(data: { slug: string; title: string; occasionId: string; draft: unknown; createdById: string }, revision: Omit<NewRevision, 'pageId'>): Promise<PageRecord>;
  /** Conditional update — returns null when `expectedVersion` is stale. */
  saveDraft(
    id: string,
    expectedVersion: number,
    data: { title: string; slug: string; draft: unknown; updatedById: string },
    revision: Omit<NewRevision, 'pageId' | 'version'>,
  ): Promise<PageRecord | null>;
  /**
   * Conditional publish — returns null when `expectedVersion` is stale.
   * One transaction: the page becomes PUBLISHED, the revision is written and the
   * rendered HTML replaces the page's publication row. All or nothing.
   */
  publish(
    id: string,
    expectedVersion: number,
    data: { published: unknown; publishedSlug: string; publishedById: string },
    revision: Omit<NewRevision, 'pageId' | 'version'>,
    rendered: RenderedPublication,
  ): Promise<PageRecord | null>;
  /** With `clearPublished`, the publication row is deleted in the same transaction as the status change. */
  setStatus(id: string, status: PageStatus, opts?: { clearPublished?: boolean }): Promise<PageRecord>;
  delete(id: string): Promise<void>;
  listRevisions(pageId: string, limit: number): Promise<RevisionRecord[]>;
  findRevision(pageId: string, revisionId: string): Promise<RevisionRecord | null>;
  pruneRevisions(pageId: string, keep: number): Promise<void>;
}

/* ---------- Publications (rendered HTML of published pages) ---------- */
export interface PublicationRecord {
  /** URL slug the page is published under — the primary key. */
  slug: string;
  pageId: string;
  version: number;
  /** Ready to insert: <style> + markup + <script>. */
  html: string;
  seo: PageSeo;
  /** Top banner image URLs, null when the page has none. */
  desktopBanner: string | null;
  mobileBanner: string | null;
  /** Always true: the row exists only while the page is published. */
  isPublished: boolean;
  publishedAt: Date;
  renderedAt: Date;
}

/** What a render produces for storage. */
export type RenderedPublication = Pick<PublicationRecord, 'html' | 'seo' | 'desktopBanner' | 'mobileBanner'>;

/** updated = new HTML stored · unchanged = HTML identical, nothing written · gone = no longer published at that version. */
export type RefreshOutcome = 'updated' | 'unchanged' | 'gone';

export interface IPublicationRepository {
  findByPageId(pageId: string): Promise<PublicationRecord | null>;
  /**
   * Re-render one published page. `render` runs while the page's publication is
   * locked, so concurrent refreshes (other requests, other containers) cannot
   * store an older rendering over a newer one. Never creates a row: a page that
   * was unpublished or republished meanwhile is left alone ("gone").
   */
  refresh(pageId: string, version: number, render: () => Promise<RenderedPublication>): Promise<RefreshOutcome>;
}

/* ---------- Brands ---------- */
export interface BrandRecord extends PublicBrand {
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrandQuery {
  search?: string;
  category?: string;
  active?: boolean;
  page: number;
  pageSize: number;
}

export interface IBrandRepository {
  query(q: BrandQuery): Promise<Paginated<BrandRecord>>;
  findById(id: string): Promise<BrandRecord | null>;
  findBySlug(slug: string): Promise<BrandRecord | null>;
  findManyByIds(ids: string[], opts?: { activeOnly?: boolean }): Promise<BrandRecord[]>;
  firstActive(limit: number): Promise<BrandRecord[]>;
  categories(): Promise<string[]>;
  create(data: BrandInput): Promise<BrandRecord>;
  update(id: string, data: BrandInput): Promise<BrandRecord>;
  upsertBySlug(data: BrandInput): Promise<{ record: BrandRecord; created: boolean }>;
  delete(id: string): Promise<void>;
}

/* ---------- Media ---------- */
export interface MediaRecord {
  id: string;
  storageKey: string;
  url: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  originalName: string;
  alt: string;
  createdAt: Date;
}

export interface IMediaRepository {
  list(opts: { page: number; pageSize: number; search?: string }): Promise<Paginated<MediaRecord>>;
  findById(id: string): Promise<MediaRecord | null>;
  create(data: Omit<MediaRecord, 'id' | 'createdAt'> & { uploadedById: string }): Promise<MediaRecord>;
  updateAlt(id: string, alt: string): Promise<MediaRecord>;
  delete(id: string): Promise<void>;
}

/* ---------- Settings & audit ---------- */
export interface ISettingsRepository {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
}

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export interface AuditRecord extends Required<Omit<AuditEntry, 'metadata'>> {
  id: string;
  metadata: unknown;
  createdAt: Date;
  actor: { name: string; email: string } | null;
}

export interface IAuditRepository {
  record(entry: AuditEntry): Promise<void>;
  list(opts: { page: number; pageSize: number; entityType?: string; entityId?: string }): Promise<Paginated<AuditRecord>>;
}

export type { RedemptionMode };
