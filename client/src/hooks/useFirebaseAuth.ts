import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  completeGoogleRedirect,
  createFirebaseAccount,
  ensureFirebaseAuthPersistence,
  ensureFirebaseProfile,
  signInWithEmail,
  signInWithGoogle,
  signOutFirebase,
  subscribeToFirebaseAuth,
} from "@/services/firebaseAuth";

export function useFirebaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    let resolveInitialAuthState: () => void = () => undefined;
    const initialAuthState = new Promise<void>((resolve) => { resolveInitialAuthState = resolve; });

    const unsubscribe = subscribeToFirebaseAuth((nextUser) => {
      if (!active) return;
      setUser(nextUser);
      setError(null);
      resolveInitialAuthState();
      if (nextUser) {
        void ensureFirebaseProfile(nextUser).catch((reason) => { if (active) setError(reason); });
      }
    }, (reason) => {
      if (!active) return;
      setError(reason);
      resolveInitialAuthState();
    });

    void Promise.all([
      ensureFirebaseAuthPersistence(),
      completeGoogleRedirect(),
      initialAuthState,
    ]).then(([, redirectUser]) => {
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
