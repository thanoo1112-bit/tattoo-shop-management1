/**
 * 157 TATTOO — Lightweight in-memory client cache for Customer Portfolio & Flash
 * 
 * Objectives:
 * - Eliminates redundant Supabase fetches when switching between /portfolio and /flash.
 * - Supports SWR-style immediate rendering of cached data with background revalidation.
 * - TTL: 3 minutes (180,000 ms).
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

let portfolioCache: CacheEntry<any> | null = null;
let flashCache: CacheEntry<any> | null = null;

export function getCachedPortfolio<T>(): { data: T; isFresh: boolean } | null {
  if (!portfolioCache) return null;
  const isFresh = Date.now() - portfolioCache.timestamp < CACHE_TTL_MS;
  return { data: portfolioCache.data as T, isFresh };
}

export function setCachedPortfolio<T>(data: T): void {
  portfolioCache = {
    data,
    timestamp: Date.now(),
  };
}

export function getCachedFlash<T>(): { data: T; isFresh: boolean } | null {
  if (!flashCache) return null;
  const isFresh = Date.now() - flashCache.timestamp < CACHE_TTL_MS;
  return { data: flashCache.data as T, isFresh };
}

export function setCachedFlash<T>(data: T): void {
  flashCache = {
    data,
    timestamp: Date.now(),
  };
}

export function clearCustomerGalleryCache(): void {
  portfolioCache = null;
  flashCache = null;
}
