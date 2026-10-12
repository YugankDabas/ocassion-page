/**
 * True when the panel runs on a developer machine. gyftr.com cannot reach a
 * local machine, so publishing here only stores the page locally and the live
 * site is never affected. The panel says so instead of talking about gyftr.com.
 */
export const IS_LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) || window.location.hostname.endsWith('.localhost');
