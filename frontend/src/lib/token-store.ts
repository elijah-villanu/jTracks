/**
 * In-memory access token store (F19).
 *
 * The access token is deliberately kept only in a module-level variable --
 * never `localStorage`, never a readable cookie. This closes the XSS
 * exfiltration surface that persisted storage exposes (PRD_V2 R7.2). The
 * only cookie the app deals with is the `jtracks_refresh` httpOnly refresh
 * cookie, which JS can't read anyway and which F21 will wire up against
 * `POST /auth/refresh`.
 *
 * A page reload clears this module's state (it's just JS memory), so the
 * user is logged out on refresh until F21 lands with a boot-time silent
 * refresh. That's an expected, acknowledged intermediate regression.
 */

let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}
