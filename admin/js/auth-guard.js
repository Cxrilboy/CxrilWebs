/**
 * auth-guard.js — Protection des routes de l'espace admin
 * ES Module — à importer en premier dans chaque page protégée
 *
 * Double vérification :
 *  1. Session Supabase Auth active (JWT valide)
 *  2. L'utilisateur figure bien dans la table admin_profiles
 *
 * Si l'une des deux conditions échoue → redirection immédiate vers /admin/
 */

import { supabase } from './supabase-admin.js';

/** URL de la page de connexion admin */
const LOGIN_URL = '/admin/';

/**
 * Vérifie la session et le profil admin.
 * Retourne le profil admin si valide, sinon redirige et retourne null.
 *
 * @returns {Promise<{ id: string, nom: string, email: string, role: string } | null>}
 */
export async function requireAdmin() {
    // 1. Vérifier la session Supabase Auth
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        redirectToLogin();
        return null;
    }

    // 2. Vérifier que cet utilisateur est bien dans admin_profiles
    const { data: profile, error: profileError } = await supabase
        .from('admin_profiles')
        .select('id, nom, email, role')
        .eq('id', session.user.id)
        .maybeSingle();

    if (profileError || !profile) {
        // Compte Supabase Auth existant mais non enregistré comme admin
        await supabase.auth.signOut();
        redirectToLogin();
        return null;
    }

    return profile;
}

/**
 * Déconnecte l'admin et redirige vers la page de connexion.
 */
export async function signOut() {
    await supabase.auth.signOut();
    window.location.href = LOGIN_URL;
}

/**
 * Redirige vers la page de login en évitant les boucles infinies.
 * @private
 */
function redirectToLogin() {
    const path = window.location.pathname;
    const isAlreadyOnLogin = path === '/admin/' || path === '/admin/index.html';
    if (!isAlreadyOnLogin) {
        window.location.replace(LOGIN_URL);
    }
}
