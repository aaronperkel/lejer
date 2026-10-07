/**
 * A refusal meant for the person who clicked: bad input, not allowed, not found. Library
 * functions throw it; server actions turn its message into ?err= (or an inline error). Anything
 * else that escapes is a bug and surfaces as one.
 */
export class ActionError extends Error {
  override name = "ActionError";
}
