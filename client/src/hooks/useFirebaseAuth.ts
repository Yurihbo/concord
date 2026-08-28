import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  completeGoogleRedirect,
  createFirebaseAccount,
  ensureFirebaseProfile,
  hasPendingGoogleRedirect,
  signInWithEmail,
  signInWithGoogle,
  signOutFirebase,
  subscribeToFirebaseAuth,
} from "@/services/firebaseAuth";

export function useFirebaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => hasPendingGoogleRedirect());
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    const redirectPending = hasPendingGoogleRedirect();
    const unsubscribe = subscribeToFirebaseAuth((nextUser) => {
      if (!active) return;
      setUser(nextUser);
      if (!nextUser) setError(null);
      if (!redirectPending) setLoading(false);
      if (nextUser) void ensureFirebaseProfile(nextUser).catch((reason) => { if (active) setError(reason); });
    }, (reason) => {
      if (!active) return;
      setError(reason);
      setLoading(false);
    });

    void completeGoogleRedirect().then((redirectUser) => {
      if (!active) return;
      if (redirectUser) {
        setUser(redirectUser);
        setError(null);
      }
      setLoading(false);
    }).catch((reason) => {
      if (!active) return;
      setError(reason);
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const loginWithGoogle = useCallback(async () => {
    clearError();
    try { return await signInWithGoogle(); } catch (reason) { setError(reason); throw reason; }
  }, [clearError]);
  const loginWithEmail = useCallback(async (email: string, password: string) => {
    clearError();
    try { return await signInWithEmail(email, password); } catch (reason) { setError(reason); throw reason; }
  }, [clearError]);
  const registerWithEmail = useCallback(async (email: string, password: string, displayName: string) => {
    clearError();
    try { return await createFirebaseAccount(email, password, displayName); } catch (reason) { setError(reason); throw reason; }
  }, [clearError]);
  const logout = useCallback(async () => { await signOutFirebase(); }, []);

  return { user, loading, error, isAuthenticated: Boolean(user), loginWithGoogle, loginWithEmail, registerWithEmail, logout, clearError };
}
