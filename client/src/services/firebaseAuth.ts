import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  setPersistence,
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
let authPersistencePromise: Promise<void> | null = null;

export type FirebaseProfileInput = {
  displayName?: string;
  avatarUrl?: string;
};

function getStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function markGoogleRedirectPending(): void {
  const storage = getStorage("localStorage") ?? getStorage("sessionStorage");
  try {
    storage?.setItem(GOOGLE_REDIRECT_PENDING_KEY, "1");
  } catch {
    // O redirect ainda pode ser concluído mesmo quando o storage está indisponível.
  }
}

function clearGoogleRedirectPending(): void {
  for (const storage of [getStorage("localStorage"), getStorage("sessionStorage")]) {
    try {
      storage?.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
    } catch {
      // Ignora bloqueios de storage; a sessão Firebase continua válida.
    }
  }
}

export function hasPendingGoogleRedirect(): boolean {
  for (const storage of [getStorage("localStorage"), getStorage("sessionStorage")]) {
    try {
      if (storage?.getItem(GOOGLE_REDIRECT_PENDING_KEY) === "1") return true;
    } catch {
      // Tenta o próximo mecanismo de storage.
    }
  }
  return false;
}

/**
 * Mantém a sessão Firebase entre aberturas do navegador e do PWA.
 * Os tokens continuam sob controle do SDK; não copiamos credenciais para storage próprio.
 */
export function ensureFirebaseAuthPersistence(): Promise<void> {
  if (!authPersistencePromise) {
    authPersistencePromise = (async () => {
      try {
        await setPersistence(firebaseAuth, browserLocalPersistence);
        return;
      } catch {
        try {
          await setPersistence(firebaseAuth, indexedDBLocalPersistence);
        } catch {
          try {
            await setPersistence(firebaseAuth, browserSessionPersistence);
          } catch {
            // Alguns webviews bloqueiam todos os storages; o SDK ainda pode manter a sessão em memória.
          }
        }
      }
    })();
  }
  return authPersistencePromise;
}

// Inicializa a persistência antes do primeiro listener de autenticação.
void ensureFirebaseAuthPersistence();

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
  await ensureFirebaseAuthPersistence();
  try {
    // O retorno deve ser consultado sempre: alguns PWA/webviews não preservam o marcador local.
    const result = await getRedirectResult(firebaseAuth);
    clearGoogleRedirectPending();
    if (!result) return null;
    await ensureFirebaseProfile(result.user);
    return result.user;
  } catch (reason) {
    clearGoogleRedirectPending();
    throw reason;
  }
}

export async function signInWithGoogle(): Promise<User | null> {
  await ensureFirebaseAuthPersistence();
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
  await ensureFirebaseAuthPersistence();
  const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
  await ensureFirebaseProfile(result.user);
  return result.user;
}

export async function createFirebaseAccount(email: string, password: string, displayName: string): Promise<User> {
  await ensureFirebaseAuthPersistence();
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
  clearGoogleRedirectPending();
  await signOut(firebaseAuth);
}

export async function ensureFirebaseProfile(user: User, input: FirebaseProfileInput = {}): Promise<void> {
  const displayName = input.displayName?.trim() || user.displayName || user.email?.split("@")[0] || "Conta Concord";
  const publicId = `CON-${user.uid.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase().padEnd(8, "0")}`;
  const avatarUrl = input.avatarUrl !== undefined ? input.avatarUrl : user.photoURL;
  await setDoc(doc(firebaseDb, "users", user.uid), {
    uid: user.uid,
    email: user.email ?? null,
    displayName,
    publicId,
    ...(avatarUrl ? { avatarUrl } : {}),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
