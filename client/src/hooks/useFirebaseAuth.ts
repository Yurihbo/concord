import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  createFirebaseAccount,
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
    return subscribeToFirebaseAuth((nextUser) => {
      setUser(nextUser);
      setLoading(false);
      if (nextUser) void ensureFirebaseProfile(nextUser).catch(setError);
    });
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
