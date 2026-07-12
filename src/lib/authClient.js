import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

const authUrl = import.meta.env.VITE_NEON_AUTH_URL;
const authClientInstance = authUrl
  ? createAuthClient(authUrl, { adapter: BetterAuthReactAdapter() })
  : null;

export const isAuthConfigured = Boolean(authClientInstance);
export const authClient = authClientInstance;

export function useAuthSession() {
  if (!authClient) return { session: null, user: null, isPending: false };
  const result = authClient.useSession();
  return { session: result.data?.session ?? null, user: result.data?.user ?? null, isPending: result.isPending };
}

export async function getAccessToken() {
  if (!authClient) return null;
  const session = await authClient.getSession();
  return session?.data?.session?.token ?? null;
}
