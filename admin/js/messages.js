/**
 * messages.js — Gestion des messages/leads (CRUD + droit à l'oubli RGPD)
 * ES Module
 */

import { supabase } from './supabase-admin.js';
import { requireAdmin, signOut } from './auth-guard.js';

// ── Vérification auth ─────────────────────────────────────────────────────────
const adminProfile = await requireAdmin();
if (!adminProfile) throw new Error('Non autorisé — redirection en cours');

document.getElementById('adminName').textContent   = adminProfile.nom;
document.getElementById('adminAvatar').textContent = adminProfile.nom.charAt(0).toUpperCase();
document.getElementById('btnSignout').addEventListener('click', () => signOut());
document.getElementById('btnToggleSidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

// ── État de la page ───────────────────────────────────────────────────────────
const PAGE_SIZE = 15;
let currentPage   = 1;
let totalCount    = 0;
let activeMessage = null; // Message ouvert dans le modal de détail

// ── Éléments DOM ──────────────────────────────────────────────────────────────
const tbody        = document.getElementById('msgTableBody');
const pagination   = document.getElementById('pagination');
const filterStatut = document.getElementById('filterStatut');
const initialStatut = new URLSearchParams(window.location.search).get('statut');
if (['true', 'false'].includes(initialStatut)) filterStatut.value = initialStatut;
const filterType   = document.getElementById('filterType');
const filterSearch = document.getElementById('filterSearch');
const msgModal     = document.getElementById('msgModal');
const confirmModal = document.getElementById('confirmModal');

// ── Chargement des messages ───────────────────────────────────────────────────
async function loadMessages() {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-row">Chargement…</td></tr>';

    let query = supabase
        .from('form_submissions')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

    // Filtres actifs
    const statut = filterStatut.value;
    const type   = filterType.value;
    const search = filterSearch.value.trim();

    if (statut !== '') query = query.eq('traite', statut === 'true');
    if (type)          query = query.eq('type', type);
    if (search)        query = query.or(`nom.ilike.%${search}%,email.ilike.%${search}%`);

    const { data, count, error } = await query;
    totalCount = count ?? 0;

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-row error-row">Erreur : ${escHtml(error.message)}</td></tr>`;
        return;
    }

    if (!data?.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Aucun message trouvé.</td></tr>';
        renderPagination();
        return;
    }

    // Stocker en mémoire pour l'ouverture des modals
    window.__messagesData = Object.fromEntries(data.map(m => [m.id, m]));

    tbody.innerHTML = data.map(m => `
        <tr class="${m.traite ? '' : 'row-unread'}">
            <td>${escHtml(m.nom)}</td>
            <td>
                <div>${escHtml(m.email)}</div>
                ${m.telephone ? `<small class="text-muted">${escHtml(m.telephone)}</small>` : ''}
            </td>
            <td><span class="badge badge-neutral">${escHtml(m.type)}</span></td>
            <td>${escHtml(m.sujet || '—')}</td>
            <td>${formatDate(m.created_at)}</td>
            <td><span class="badge ${m.traite ? 'badge-success' : 'badge-warning'}">${m.traite ? 'Traité' : 'Nouveau'}</span></td>
            <td>
                <button class="btn-table btn-view" data-id="${escHtml(m.id)}" title="Voir le détail" aria-label="Voir le détail">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
            </td>
        </tr>
    `).join('');

    // Attacher les événements sur les boutons "Voir"
    tbody.querySelectorAll('.btn-view').forEach(btn => {
        btn.addEventListener('click', () => openModal(btn.dataset.id));
    });

    renderPagination();
}

// ── Pagination ────────────────────────────────────────────────────────────────
function renderPagination() {
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    if (totalPages <= 1) { pagination.innerHTML = ''; return; }

    pagination.innerHTML = `
        <span class="page-info">Page ${currentPage} / ${totalPages} (${totalCount} entrées)</span>
        <button class="btn-page" id="btnPrev" ${currentPage === 1 ? 'disabled' : ''}>← Préc.</button>
        <button class="btn-page" id="btnNext" ${currentPage >= totalPages ? 'disabled' : ''}>Suiv. →</button>
    `;

    pagination.querySelector('#btnPrev')?.addEventListener('click', () => { currentPage--; loadMessages(); });
    pagination.querySelector('#btnNext')?.addEventListener('click', () => { currentPage++; loadMessages(); });
}

// ── Modal détail ──────────────────────────────────────────────────────────────
function openModal(id) {
    const m = window.__messagesData?.[id];
    if (!m) return;
    activeMessage = m;

    document.getElementById('modalTitle').textContent = `Message de ${m.nom}`;

    document.getElementById('modalBody').innerHTML = `
        <dl class="detail-list">
            <dt>Nom</dt>       <dd>${escHtml(m.nom)}</dd>
            <dt>Email</dt>     <dd><a href="mailto:${escHtml(m.email)}">${escHtml(m.email)}</a></dd>
            <dt>Téléphone</dt> <dd>${escHtml(m.telephone || 'Non renseigné')}</dd>
            <dt>Type</dt>      <dd>${escHtml(m.type)}</dd>
            <dt>Sujet</dt>     <dd>${escHtml(m.sujet || 'Non renseigné')}</dd>
            <dt>Message</dt>   <dd class="message-content">${escHtml(m.message || 'Aucun message')}</dd>
            <dt>Service</dt>   <dd>${escHtml(m.service_ref || '—')}</dd>
            <dt>RGPD</dt>      <dd>${m.rgpd_consent ? '✅ Consenti' : '❌ Non consenti'}</dd>
            <dt>Reçu le</dt>   <dd>${formatDate(m.created_at)}</dd>
            <dt>Statut</dt>    <dd><span class="badge ${m.traite ? 'badge-success' : 'badge-warning'}">${m.traite ? 'Traité' : 'Nouveau'}</span></dd>
        </dl>
        ${m.metadata ? `<details class="meta-details"><summary>Métadonnées brutes</summary><pre>${escHtml(JSON.stringify(m.metadata, null, 2))}</pre></details>` : ''}
    `;

    // Adapter le libellé du bouton selon le statut courant
    const btnDone = document.getElementById('btnMarkDone');
    btnDone.textContent = m.traite ? 'Marquer non traité' : 'Marquer traité';

    msgModal.classList.add('visible');
}

function closeModal() {
    msgModal.classList.remove('visible');
    activeMessage = null;
}

// ── Marquer traité / non traité ───────────────────────────────────────────────
document.getElementById('btnMarkDone').addEventListener('click', async () => {
    if (!activeMessage) return;
    const newStatus = !activeMessage.traite;

    const { error } = await supabase
        .from('form_submissions')
        .update({ traite: newStatus })
        .eq('id', activeMessage.id);

    if (!error) {
        closeModal();
        loadMessages();
    }
});

// ── Suppression définitive (RGPD — droit à l'oubli) ──────────────────────────
document.getElementById('btnDeleteMsg').addEventListener('click', () => {
    if (!activeMessage) return;
    msgModal.classList.remove('visible');
    confirmModal.classList.add('visible');
});

document.getElementById('confirmCancel').addEventListener('click', () => {
    confirmModal.classList.remove('visible');
    // Réouvrir le modal de détail si un message était actif
    if (activeMessage) msgModal.classList.add('visible');
});

document.getElementById('confirmDelete').addEventListener('click', async () => {
    if (!activeMessage) return;
    const idToDelete = activeMessage.id;

    const { error } = await supabase
        .from('form_submissions')
        .delete()
        .eq('id', idToDelete);

    confirmModal.classList.remove('visible');
    closeModal();

    if (!error) loadMessages();
});

// ── Fermeture des modals ──────────────────────────────────────────────────────
document.getElementById('modalClose').addEventListener('click',  closeModal);
document.getElementById('modalClose2').addEventListener('click', closeModal);
// Clic sur l'overlay pour fermer
msgModal.addEventListener('click', e => { if (e.target === msgModal) closeModal(); });

// ── Filtres avec debounce ─────────────────────────────────────────────────────
let debounceTimer;

function onFilterChange() {
    currentPage = 1;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadMessages, 300);
}

filterStatut.addEventListener('change', onFilterChange);
filterType.addEventListener('change',   onFilterChange);
filterSearch.addEventListener('input',  onFilterChange);

// ── Utilitaires ───────────────────────────────────────────────────────────────

/** Échappe les caractères HTML pour prévenir les injections XSS */
function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

// ── Lancement ─────────────────────────────────────────────────────────────────
loadMessages();
