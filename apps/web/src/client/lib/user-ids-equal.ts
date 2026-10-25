/** タイムラインの actor id と /api/auth/me の id を突き合わせる（前後空白のズレを吸収） */
export function userIdsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (a == null || b == null) return false;
  return a.trim() === b.trim();
}
