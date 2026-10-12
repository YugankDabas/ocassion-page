import type { Logger } from '../lib/logger';

/** Shared data that published pages are rendered from. */
export type ContentChange = 'brands' | 'site';

export interface IContentChangeNotifier {
  /** Announce that shared data changed. Returns immediately; listeners run in the background. */
  changed(what: ContentChange): void;
}

/**
 * Decouples "a brand / the site settings changed" from "published pages must be
 * re-rendered": services announce changes here, and the publication service
 * subscribes. A failing listener is logged and never breaks the caller.
 */
export class ContentChangeHub implements IContentChangeNotifier {
  private readonly listeners: ((what: ContentChange) => Promise<unknown>)[] = [];

  constructor(private readonly logger: Logger) {}

  subscribe(listener: (what: ContentChange) => Promise<unknown>): void {
    this.listeners.push(listener);
  }

  changed(what: ContentChange): void {
    for (const listener of this.listeners) {
      listener(what).catch((err: unknown) => this.logger.error({ err, what }, 'Content-change listener failed'));
    }
  }
}
