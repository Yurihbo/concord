import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { firebaseDb } from "@/lib/firebase";
import type { FirebaseSignal } from "@/services/firebaseStore";

export async function publishSignal(callId: string, signal: Omit<FirebaseSignal, "id" | "createdAt">): Promise<string> {
  const created = await addDoc(collection(firebaseDb, "calls", callId, "signals"), { ...signal, createdAt: serverTimestamp() });
  return created.id;
}

export function subscribeToSignals(callId: string, recipientId: string, listener: (signals: FirebaseSignal[]) => void, onError?: (error: Error) => void): Unsubscribe {
  return onSnapshot(query(collection(firebaseDb, "calls", callId, "signals"), where("to", "==", recipientId), orderBy("createdAt", "asc"), limit(100)), (snapshot) => {
    listener(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as FirebaseSignal)));
  }, (reason) => onError?.(reason instanceof Error ? reason : new Error("Não foi possível sincronizar a sinalização da chamada.")));
}
