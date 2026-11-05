import { useEffect, useState, useCallback } from 'react';
import { fetchLocalTable, saveLocalTable, deleteLocalTableRecords } from './localClient';

export function useFirestoreSync<T extends { id: string }>(
  collectionName: string,
  initialData: T[]
) {
  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchLocalTable<T>(collectionName).then((rows) => {
      if (!active) return;
      if (rows && rows.length > 0) setData(rows);
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [collectionName]);

  const upsert = useCallback(async (item: T) => {
    setData(prev => [...prev.filter(x => x.id !== item.id), item]);
    await saveLocalTable(collectionName, item);
  }, [collectionName]);

  const remove = useCallback(async (id: string) => {
    setData(prev => prev.filter(x => x.id !== id));
    await deleteLocalTableRecords(collectionName, [id]);
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
    let active = true;
    fetchLocalTable<any>(collectionName).then((rows) => {
      if (!active) return;
      if (rows && rows.length > 0) {
        const found = rows.find((r: any) => r.id === docId) || rows[0];
        if (found) setData(found as T);
      }
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [collectionName, docId]);

  const update = useCallback(async (updates: T) => {
    setData(updates);
    await saveLocalTable(collectionName, { id: docId, ...(updates as any) });
  }, [collectionName, docId]);

  return [data, update, loading] as const;
}
