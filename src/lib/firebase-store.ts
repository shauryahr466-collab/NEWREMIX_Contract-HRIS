import { useEffect, useState, useCallback } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  query, 
  where,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from './firebase';

export function useFirestoreSync<T extends { id: string }>(
  collectionName: string,
  initialData: T[]
) {
  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, collectionName), (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as T));
      setData(docs);
      setLoading(false);
    }, (error) => {
      console.error(`Error syncing ${collectionName}:`, error);
      setLoading(false);
    });
    return () => unsub();
  }, [collectionName]);

  const upsert = useCallback(async (item: T) => {
    await setDoc(doc(db, collectionName, item.id), item);
  }, [collectionName]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(doc(db, collectionName, id));
  }, [collectionName]);

  return [data, upsert, remove, loading] as const;
}

export function useFirestoreDocumentSync<T>(
  collectionName: string,
  docId: string,
  initialData: T
) {
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, collectionName, docId), (snapshot) => {
      if (snapshot.exists()) {
        setData(snapshot.data() as T);
      }
      setLoading(false);
    }, (error) => {
      console.error(`Error syncing ${collectionName}/${docId}:`, error);
      setLoading(false);
    });
    return () => unsub();
  }, [collectionName, docId]);

  const update = useCallback(async (updates: T) => {
    await setDoc(doc(db, collectionName, docId), updates, { merge: true });
  }, [collectionName, docId]);

  return [data, update, loading] as const;
}
