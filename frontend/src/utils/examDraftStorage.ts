export interface ExamDraft {
  attemptId: string;
  answers: Record<string, Record<string, unknown>>;
  marked: Record<string, boolean>;
  visited: number[];
  currentIndex: number;
  savedAt: string;
}

const DB_NAME = 'exam-system';
const STORE_NAME = 'drafts';
const DB_VERSION = 1;

function localKey(attemptId: string) {
  return `exam-draft-${attemptId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'attemptId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveExamDraft(draft: ExamDraft): Promise<void> {
  const payload = JSON.stringify(draft);
  localStorage.setItem(localKey(draft.attemptId), payload);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(draft);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* IndexedDB unavailable — localStorage backup is sufficient */
  }
}

export async function loadExamDraft(attemptId: string): Promise<ExamDraft | null> {
  try {
    const db = await openDb();
    const fromIdb = await new Promise<ExamDraft | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(attemptId);
      req.onsuccess = () => resolve((req.result as ExamDraft | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (fromIdb) return fromIdb;
  } catch {
    /* fall through */
  }

  const raw = localStorage.getItem(localKey(attemptId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ExamDraft;
  } catch {
    return null;
  }
}

export async function clearExamDraft(attemptId: string): Promise<void> {
  localStorage.removeItem(localKey(attemptId));
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(attemptId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
