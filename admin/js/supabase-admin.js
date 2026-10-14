/**
 * supabase-admin.js — Client Supabase partagé pour l'espace admin
 * ES Module — importé par tous les scripts admin
 *
 * Les credentials sont lus depuis les meta tags de la page hôte,
 * identiques au pattern existant du site (meta[name="supabase-url"]).
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/**
 * Lit les credentials Supabase depuis les meta tags de la page courante.
 * @returns {{ url: string, key: string }}
 */
function getCredentials() {
    const url = document.querySelector('meta[name="supabase-url"]')?.getAttribute('content') ?? '';
    const key = document.querySelector('meta[name="supabase-key"]')?.getAttribute('content') ?? '';
    if (!url || !key) {
        throw new Error('[Admin] Meta tags supabase-url / supabase-key manquants sur cette page.');
    }
    return { url, key };
}

const { url, key } = getCredentials();

/**
 * Instance unique du client Supabase pour tout l'espace admin.
 * La session est persistée dans localStorage et le token est
 * automatiquement renouvelé avant expiration.
 *
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
export const supabase = createClient(url, key, {
    auth: {
        persistSession:     true,
        autoRefreshToken:   true,
        detectSessionInUrl: true,
    },
});
