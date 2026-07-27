/**
 * Storage Controller with IndexedDB Primary Layer and LocalStorage Fallback
 */
class StorageController {
  constructor() {
    this.dbName = 'ApexStreamDB';
    this.dbVersion = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not available. Falling back to LocalStorage.');
        resolve(false);
        return;
      }

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (evt) => {
        console.error('IndexedDB error:', evt.target.errorCode);
        resolve(false);
      };

      request.onsuccess = (evt) => {
        this.db = evt.target.result;
        resolve(true);
      };

      request.onupgradeneeded = (evt) => {
        const db = evt.target.result;
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  async set(storeName, key, value) {
    if (this.db) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const payload = storeName === 'playlists' ? value : { key, value };
        const req = store.put(payload);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } else {
      localStorage.setItem(`${storeName}_${key}`, JSON.stringify(value));
      return Promise.resolve(true);
    }
  }

  async get(storeName, key) {
    if (this.db) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => {
          if (!req.result) return resolve(null);
          resolve(storeName === 'playlists' ? req.result : req.result.value);
        };
        req.onerror = () => reject(req.error);
      });
    } else {
      const item = localStorage.getItem(`${storeName}_${key}`);
      return Promise.resolve(item ? JSON.parse(item) : null);
    }
  }

  async getAll(storeName) {
    if (this.db) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } else {
      const results = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(`${storeName}_`)) {
          results.push(JSON.parse(localStorage.getItem(k)));
        }
      }
      return Promise.resolve(results);
    }
  }

  async remove(storeName, key) {
    if (this.db) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } else {
      localStorage.removeItem(`${storeName}_${key}`);
      return Promise.resolve(true);
    }
  }

  async clearAll() {
    if (this.db) {
      const tx = this.db.transaction(['playlists', 'settings'], 'readwrite');
      tx.objectStore('playlists').clear();
      tx.objectStore('settings').clear();
    }
    localStorage.clear();
  }
}

window.appStorage = new StorageController();
