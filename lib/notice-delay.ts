/**
 * How long a new-bill email waits in the queue (lib/notices.ts) before it can go out: the window
 * for fixing a bad post. Its own module so client components can say it without importing the
 * queue (which needs the database).
 */
export const NOTICE_DELAY_MINUTES = 10;
