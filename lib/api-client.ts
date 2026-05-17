// lib/api-client.ts
//
// authedFetch — a thin wrapper around fetch() that:
//   1. attaches a fresh Google access token,
//   2. on 401, refreshes the token ONCE and retries the call,
//   3. dedupes concurrent refresh attempts via a shared in-flight promise,
//   4. forces sign-out when the refresh itself fails so the UI never silently
//      keeps calling APIs with a dead token.
//
// Consumers pass plain RequestInit; we own the Authorization header.

type TokenRefresher = () => Promise<string | null>;
type TokenReader = () => string | null;
type SignOut = () => void;

interface AuthHandles {
    getAccessToken: TokenReader;
    signInWithGoogle: TokenRefresher;
    signOut: SignOut;
}

let inFlightRefresh: Promise<string | null> | null = null;

async function refreshOnce(auth: AuthHandles): Promise<string | null> {
    if (inFlightRefresh) return inFlightRefresh;
    inFlightRefresh = (async () => {
        try {
            return await auth.signInWithGoogle();
        } finally {
            inFlightRefresh = null;
        }
    })();
    return inFlightRefresh;
}

export async function authedFetch(
    input: string,
    init: RequestInit | undefined,
    auth: AuthHandles,
): Promise<Response> {
    let token = auth.getAccessToken();
    if (!token) {
        token = await refreshOnce(auth);
    }
    if (!token) {
        throw new Error("Authentication required. Please sign in again.");
    }

    const buildHeaders = (t: string): HeadersInit => ({
        "Content-Type": "application/json",
        ...(init?.headers || {}),
        Authorization: `Bearer ${t}`,
    });

    const first = await fetch(input, { ...init, headers: buildHeaders(token) });
    if (first.status !== 401) return first;

    // 401 — refresh once and retry. If the second attempt also fails with 401,
    // the session is truly dead. Sign out so the UI flips back to the login state.
    const refreshed = await refreshOnce(auth);
    if (!refreshed) {
        auth.signOut();
        throw new Error("Your session has expired. Please sign in again.");
    }

    const second = await fetch(input, { ...init, headers: buildHeaders(refreshed) });
    if (second.status === 401) {
        auth.signOut();
        throw new Error("Your session has expired. Please sign in again.");
    }
    return second;
}
