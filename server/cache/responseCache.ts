interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class ResponseCache {
  private store = new Map<string, CacheEntry<any>>();
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
    setInterval(() => this.evictExpired(), 60_000).unref();
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs = 300_000): void {
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  stats() {
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      utilizationPct: Math.round((this.store.size / this.maxSize) * 100),
    };
  }
}

export const responseCache = new ResponseCache(500);
