/**
 * Returns the active user id. For the MVP we use a single user attributed
 * via DEFAULT_USER_ID so the demo works without a sign-in flow. When auth
 * lands, swap this for the Supabase session user.
 */
export function getUserId(): string {
  const id = process.env.DEFAULT_USER_ID;
  if (!id) {
    throw new Error("DEFAULT_USER_ID is not set. See .env.example.");
  }
  return id;
}
