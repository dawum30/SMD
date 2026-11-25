import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY_URL = 'akwaaba_supabase_url';
const STORAGE_KEY_ANON = 'akwaaba_supabase_anon_key';

export function normalizeSupabaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return trimmed
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/auth\/v1\/?$/i, '')
      .replace(/\/+$/, '');
  }
}

export function getSupabaseConfig(): { url: string; anonKey: string; source: 'env' | 'runtime' | 'none' } {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (envUrl && envKey && !envUrl.includes('your-project-ref')) {
    return { url: normalizeSupabaseUrl(envUrl), anonKey: envKey.trim(), source: 'env' };
  }

  if (typeof window !== 'undefined') {
    const rtUrl = window.localStorage.getItem(STORAGE_KEY_URL);
    const rtKey = window.localStorage.getItem(STORAGE_KEY_ANON);
    if (rtUrl && rtKey) {
      return { url: normalizeSupabaseUrl(rtUrl), anonKey: rtKey.trim(), source: 'runtime' };
    }
  }

  return { url: '', anonKey: '', source: 'none' };
}

export function isSupabaseConfigured(): boolean {
  const cfg = getSupabaseConfig();
  return Boolean(cfg.url && cfg.anonKey);
}

export function saveRuntimeSupabaseConfig(url: string, anonKey: string): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY_URL, normalizeSupabaseUrl(url));
    window.localStorage.setItem(STORAGE_KEY_ANON, anonKey.trim());
  }
}

export function clearRuntimeSupabaseConfig(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY_URL);
    window.localStorage.removeItem(STORAGE_KEY_ANON);
  }
}

let cachedClient: SupabaseClient | null = null;
let cachedSignature = '';

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;
  const sig = `${url}|${anonKey}`;
  if (cachedClient && cachedSignature === sig) {
    return cachedClient;
  }
  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  cachedSignature = sig;
  return cachedClient;
}

export function createEphemeralSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'akwaaba_ephemeral_signup',
    },
  });
}
