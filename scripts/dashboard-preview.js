// Used only by the loopback preview server. Never connects to the live backend.
import { mountDashboard } from '/admin/js/dashboard-view.js';
import { summarizeInvoices } from '/admin/js/dashboard-data.js';

const state = new URLSearchParams(window.location.search).get('state');
const messages = [
    { nom: 'Camille Martin', email: 'camille@example.com', sujet: 'Création d’un site vitrine', created_at: '2026-09-15T13:30:00Z', traite: false },
    { nom: 'Atelier des Îles', email: 'contact@example.com', sujet: 'Demande de devis — boutique en ligne', created_at: '2026-09-14T16:15:00Z', traite: false },
    { nom: 'Thomas Laurent', email: 'thomas@example.com', sujet: 'Maintenance de mon site', created_at: '2026-09-14T11:00:00Z', traite: true },
    { nom: 'Maison Kalina', email: 'bonjour@example.com', sujet: 'Accompagnement réseaux sociaux', created_at: '2026-09-13T14:00:00Z', traite: false },
    { nom: 'Léa Bernard', email: 'lea@example.com', sujet: 'Installation réseau', created_at: '2026-09-12T16:00:00Z', traite: true },
];
const invoices = [
    { numero: 'FAC-2026-008', client_nom: 'Atelier des Îles', montant_ttc: 840, statut: 'envoyee', date_emission: '2026-09-15' },
    { numero: 'FAC-2026-007', client_nom: 'Camille Martin', montant_ttc: 1250, statut: 'payee', date_emission: '2026-09-12' },
    { numero: 'FAC-2026-006', client_nom: 'Maison Kalina', montant_ttc: 320, statut: 'brouillon', date_emission: '2026-09-11' },
    { numero: 'FAC-2026-005', client_nom: 'Thomas Laurent', montant_ttc: 180, statut: 'payee', date_emission: '2026-09-10' },
    { numero: 'FAC-2026-004', client_nom: 'Léa Bernard', montant_ttc: 450, statut: 'envoyee', date_emission: '2026-09-08' },
    { montant_ttc: 750, statut: 'payee' }, { montant_ttc: 300, statut: 'payee' }, { montant_ttc: 200, statut: 'annulee' },
];
if (state === 'long') {
    messages[0].nom = 'Entreprise avec une dénomination particulièrement longue';
    messages[0].email = 'contact-tres-long-pour-verifier-le-tableau@example.com';
    messages[0].sujet = '<img src=x onerror=alert(1)> & texte client';
    invoices[0].montant_ttc = 123456.78;
}
let round = 0;
const isError = () => state === 'error' || (state === 'recover' && round === 1);
const result = async (value, fail = false) => {
    if (fail) throw new Error('Simulated offline state');
    return value;
};
await mountDashboard({
    profile: { nom: 'Cyril' },
    source: {
        messagesOverview: () => { round++; return result(state === 'empty' ? { total: 0, unread: 0 } : { total: 42, unread: 6 }, isError()); },
        invoicesOverview: () => result(summarizeInvoices(state === 'empty' ? [] : invoices), isError()),
        latestMessages: () => result(state === 'empty' ? [] : messages, isError() || state === 'partial'),
        latestInvoices: () => result(state === 'empty' ? [] : invoices.slice(0, 5), isError()),
    },
    onSignOut: async () => { window.location.href = '/admin/'; },
});
