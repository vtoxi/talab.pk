import { Injectable } from '@angular/core';

export interface SavedMediaItem {
  id: string;
  pinId: string;
  name: string;
  type: 'image' | 'video';
  blob: Blob;
}

export interface DisplayMediaItem {
  id: string;
  name: string;
  type: 'image' | 'video';
  url: string;
}

const DB_NAME = 'talab_property_media';
const STORE_NAME = 'media';
const DB_VERSION = 1;

@Injectable({ providedIn: 'root' })
export class PropertyMediaService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('pinId', 'pinId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return this.dbPromise;
  }

  async saveMedia(pinId: string, items: { id: string; name: string; type: 'image' | 'video'; blob: Blob }[]): Promise<void> {
    if (!items.length) return;
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const item of items) {
        store.put({ id: item.id, pinId, name: item.name, type: item.type, blob: item.blob });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getMediaForPin(pinId: string): Promise<DisplayMediaItem[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('pinId');
      const req = index.getAll(IDBKeyRange.only(pinId));
      req.onsuccess = () => {
        const raw = (req.result || []) as SavedMediaItem[];
        const display = raw.map(m => ({
          id: m.id,
          name: m.name,
          type: m.type,
          url: URL.createObjectURL(m.blob),
        }));
        resolve(display);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteMediaForPin(pinId: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('pinId');
      const req = index.getAllKeys(IDBKeyRange.only(pinId));
      req.onsuccess = () => {
        const keys = req.result;
        for (const k of keys) store.delete(k);
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }
}
