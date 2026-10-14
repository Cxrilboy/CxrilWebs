import { mountDashboard } from './dashboard-view.js';
import { createDashboardSource } from './dashboard-data.js';

// The live dashboard always requires an authenticated administrator.
try {
    const [{ supabase }, { requireAdmin, signOut }] = await Promise.all([
        import('./supabase-admin.js'), import('./auth-guard.js'),
    ]);
    const profile = await requireAdmin();
    if (profile) await mountDashboard({ profile, source: createDashboardSource(supabase), onSignOut: signOut });
} catch {
    const notice = document.getElementById('dashboardNotice');
    notice.hidden = false;
    notice.textContent = 'Impossible de charger ton espace. Vérifie ta connexion, puis clique sur Actualiser.';
    document.getElementById('syncStatus').textContent = 'Connexion indisponible';
    document.getElementById('btnRefresh').addEventListener('click', () => window.location.reload());
    document.getElementById('btnSignout').addEventListener('click', () => { window.location.href = '/admin/'; });
}
