import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "@/lib/firebase";

const googleProvider = new GoogleAuthProvider();


export type FirebaseProfileInput = {
  displayName?: string;
  avatarUrl?: string;
};

export function subscribeToFirebaseAuth(listener: (user: User | null) => void): () => void {
  return onAuthStateChanged(firebaseAuth, listener);
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(firebaseAuth, googleProvider);
  await ensureFirebaseProfile(result.user);
  return result.user;
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
    presence: "online",
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
