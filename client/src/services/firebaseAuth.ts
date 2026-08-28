import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type AuthError,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "@/lib/firebase";

const GOOGLE_REDIRECT_PENDING_KEY = "concord.google-redirect-pending";
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export type FirebaseProfileInput = {
  displayName?: string;
  avatarUrl?: string;
};

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function markGoogleRedirectPending(): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(GOOGLE_REDIRECT_PENDING_KEY, "1");
  } catch {
    // A navegação de redirect ainda funciona quando o storage está indisponível.
  }
}

function clearGoogleRedirectPending(): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
  } catch {
    // O resultado do redirect continua válido mesmo sem limpar o marcador local.
  }
}

export function hasPendingGoogleRedirect(): boolean {
  if (!canUseSessionStorage()) return false;
  try {
    return window.sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function shouldUseGoogleRedirect(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || navigator.vendor || "";
  const isAppleTouchDevice = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) || isAppleTouchDevice;
  const isEmbeddedBrowser = window.top !== window.self;
  return isMobileDevice || isEmbeddedBrowser;
}

function shouldFallbackToRedirect(reason: unknown): boolean {
  const code = (reason as AuthError | undefined)?.code;
  return code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment";
}

export function subscribeToFirebaseAuth(listener: (user: User | null) => void, onError?: (reason: unknown) => void): () => void {
  return onAuthStateChanged(firebaseAuth, listener, onError);
}

export async function completeGoogleRedirect(): Promise<User | null> {
  if (!hasPendingGoogleRedirect()) return null;
  try {
    const result = await getRedirectResult(firebaseAuth);
    if (!result) return null;
    await ensureFirebaseProfile(result.user);
    return result.user;
  } finally {
    clearGoogleRedirectPending();
  }
}

export async function signInWithGoogle(): Promise<User | null> {
  if (shouldUseGoogleRedirect()) {
    markGoogleRedirectPending();
    await signInWithRedirect(firebaseAuth, googleProvider);
    return null;
  }

  try {
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    await ensureFirebaseProfile(result.user);
    return result.user;
  } catch (reason) {
    if (!shouldFallbackToRedirect(reason)) throw reason;
    markGoogleRedirectPending();
    await signInWithRedirect(firebaseAuth, googleProvider);
    return null;
  }
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
  await ensureFirebaseProfile(result.user);
  return result.user;
}

export async function createFirebaseAccount(email: string, password: string, displayName: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  if (displayName.trim()) await updateProfile(result.user, { displayName: displayName.trim() });
  await ensureFirebaseProfile(result.user, { displayName });
  return result.user;
}

export async function updateFirebaseProfile(user: User, input: FirebaseProfileInput): Promise<void> {
  await updateProfile(user, { displayName: input.displayName, photoURL: input.avatarUrl });
  await ensureFirebaseProfile(user, input);
}

export async function signOutFirebase(): Promise<void> {
  await signOut(firebaseAuth);
}

export async function ensureFirebaseProfile(user: User, input: FirebaseProfileInput = {}): Promise<void> {
  const displayName = input.displayName?.trim() || user.displayName || user.email?.split("@")[0] || "Conta Concord";
  const publicId = `CON-${user.uid.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase().padEnd(8, "0")}`;
  await setDoc(doc(firebaseDb, "users", user.uid), {
    uid: user.uid,
    email: user.email ?? null,
    displayName,
    publicId,
    avatarUrl: input.avatarUrl ?? user.photoURL ?? null,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
