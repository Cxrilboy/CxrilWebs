/**
 * factures.js — Gestion complète des factures (CRUD + statut inline)
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
const PAGE_SIZE    = 15;
let currentPage    = 1;
let totalCount     = 0;
let editingId      = null; // null = création, UUID = modification
let deleteTargetId = null;
let lignes         = [];   // tableau des lignes de facturation : [{label, qte, pu_ht}]

// ── Éléments DOM ──────────────────────────────────────────────────────────────
const tbody        = document.getElementById('invTableBody');
const pagination   = document.getElementById('pagination');
const filterStatut = document.getElementById('filterStatut');
const initialStatut = new URLSearchParams(window.location.search).get('statut');
if (['brouillon', 'envoyee', 'payee', 'annulee'].includes(initialStatut)) filterStatut.value = initialStatut;
const filterSearch = document.getElementById('filterSearch');
const invoiceModal = document.getElementById('invoiceModal');
const confirmModal = document.getElementById('confirmModal');
const formError    = document.getElementById('formError');

// ── Chargement des factures ───────────────────────────────────────────────────
async function loadInvoices() {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-row">Chargement…</td></tr>';

    let query = supabase
        .from('invoices')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

    const statut = filterStatut.value;
    const search = filterSearch.value.trim();

    if (statut) query = query.eq('statut', statut);
    if (search) query = query.or(`numero.ilike.%${search}%,client_nom.ilike.%${search}%,client_email.ilike.%${search}%`);

    const { data, count, error } = await query;
    totalCount = count ?? 0;

    if (error) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-row error-row">Erreur : ${escHtml(error.message)}</td></tr>`;
        return;
    }

    if (!data?.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Aucune facture trouvée.</td></tr>';
        renderPagination();
        return;
    }

    // Stocker en mémoire pour l'édition sans appel Supabase supplémentaire
    window.__invoicesData = Object.fromEntries(data.map(inv => [inv.id, inv]));

    tbody.innerHTML = data.map(inv => `
        <tr>
            <td><code>${escHtml(inv.numero)}</code></td>
            <td>
                <div>${escHtml(inv.client_nom)}</div>
                <small class="text-muted">${escHtml(inv.client_email)}</small>
            </td>
            <td class="desc-cell">${escHtml(inv.description)}</td>
            <td><strong>${formatCurrency(inv.montant_ttc)}</strong></td>
            <td>
                <select class="status-select" data-id="${escHtml(inv.id)}" aria-label="Modifier le statut">
                    <option value="brouillon" ${inv.statut === 'brouillon' ? 'selected' : ''}>Brouillon</option>
                    <option value="envoyee"   ${inv.statut === 'envoyee'   ? 'selected' : ''}>Envoyée</option>
                    <option value="payee"     ${inv.statut === 'payee'     ? 'selected' : ''}>Payée</option>
                    <option value="annulee"   ${inv.statut === 'annulee'   ? 'selected' : ''}>Annulée</option>
                </select>
            </td>
            <td>${formatDate(inv.date_emission)}</td>
            <td>${inv.date_echeance ? formatDate(inv.date_echeance) : '—'}</td>
            <td class="actions-cell">
                <button class="btn-table btn-edit"       data-id="${escHtml(inv.id)}" title="Modifier" aria-label="Modifier la facture">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="btn-table btn-danger-sm"  data-id="${escHtml(inv.id)}" title="Supprimer" aria-label="Supprimer la facture">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                </button>
            </td>
        </tr>
    `).join('');

    // Mise à jour inline du statut
    tbody.querySelectorAll('.status-select').forEach(sel => {
        sel.addEventListener('change', () => updateStatus(sel.dataset.id, sel.value));
    });

    // Boutons modifier / supprimer
    tbody.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    tbody.querySelectorAll('.btn-danger-sm').forEach(btn => {
        btn.addEventListener('click', () => promptDelete(btn.dataset.id));
    });

    renderPagination();
}

// ── Mise à jour inline du statut ──────────────────────────────────────────────
async function updateStatus(id, newStatut) {
    const { error } = await supabase
        .from('invoices')
        .update({ statut: newStatut })
        .eq('id', id);

    if (error) console.error('[Factures] Erreur mise à jour statut:', error.message);
}

// ── Pagination ────────────────────────────────────────────────────────────────
function renderPagination() {
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    if (totalPages <= 1) { pagination.innerHTML = ''; return; }

    pagination.innerHTML = `
        <span class="page-info">Page ${currentPage} / ${totalPages} (${totalCount} factures)</span>
        <button class="btn-page" id="btnPrev" ${currentPage === 1 ? 'disabled' : ''}>← Préc.</button>
        <button class="btn-page" id="btnNext" ${currentPage >= totalPages ? 'disabled' : ''}>Suiv. →</button>
    `;

    pagination.querySelector('#btnPrev')?.addEventListener('click', () => { currentPage--; loadInvoices(); });
    pagination.querySelector('#btnNext')?.addEventListener('click', () => { currentPage++; loadInvoices(); });
}

// ── Modal création ────────────────────────────────────────────────────────────
function openCreateModal() {
    editingId = null;
    lignes    = [];
    resetForm();

    const year = new Date().getFullYear();
    document.getElementById('f_numero').value        = `FAC-${year}-`;
    document.getElementById('f_date_emission').value = new Date().toISOString().slice(0, 10);
    document.getElementById('invoiceModalTitle').textContent = 'Nouvelle facture';

    renderLignes();
    invoiceModal.classList.add('visible');
}

// ── Modal modification ────────────────────────────────────────────────────────
function openEditModal(id) {
    const inv = window.__invoicesData?.[id];
    if (!inv) return;
    editingId = id;
    lignes    = Array.isArray(inv.lignes) ? [...inv.lignes] : [];

    document.getElementById('invoiceModalTitle').textContent = `Modifier — ${inv.numero}`;
    document.getElementById('f_numero').value        = inv.numero;
    document.getElementById('f_statut').value        = inv.statut;
    document.getElementById('f_client_nom').value    = inv.client_nom;
    document.getElementById('f_client_email').value  = inv.client_email;
    document.getElementById('f_client_tel').value    = inv.client_tel ?? '';
    document.getElementById('f_description').value   = inv.description;
    document.getElementById('f_tva').value            = inv.taux_tva;
    document.getElementById('f_date_emission').value  = inv.date_emission ?? '';
    document.getElementById('f_date_echeance').value  = inv.date_echeance ?? '';
    document.getElementById('f_notes').value          = inv.notes ?? '';

    renderLignes();
    updateTotaux();
    invoiceModal.classList.add('visible');
}

function closeInvoiceModal() {
    invoiceModal.classList.remove('visible');
    editingId = null;
    lignes    = [];
    formError.classList.remove('visible');
    formError.textContent = '';
}

function resetForm() {
    document.getElementById('invoiceForm').reset();
    formError.classList.remove('visible');
    formError.textContent = '';
}

// ── Lignes de facturation ─────────────────────────────────────────────────────
function renderLignes() {
    const container = document.getElementById('lignesContainer');

    if (!lignes.length) {
        container.innerHTML = '<p class="text-muted" style="margin:.5rem 0;font-size:.85rem;">Aucune ligne — cliquez sur « + Ajouter une ligne ».</p>';
        updateTotaux();
        return;
    }

    container.innerHTML = lignes.map((l, i) => `
        <div class="ligne-row" data-index="${i}">
            <input type="text"   class="ligne-label" value="${escHtml(l.label)}" placeholder="Description"  data-field="label"  data-index="${i}" aria-label="Description ligne ${i + 1}">
            <input type="number" class="ligne-qte"   value="${l.qte}"            min="1" step="1"            data-field="qte"    data-index="${i}" aria-label="Quantité">
            <input type="number" class="ligne-pu"    value="${l.pu_ht}"          min="0" step="0.01"         data-field="pu_ht"  data-index="${i}" aria-label="Prix unitaire HT">
            <span class="ligne-total">${formatCurrency(l.qte * l.pu_ht)}</span>
            <button type="button" class="btn-remove-ligne" data-index="${i}" title="Supprimer la ligne" aria-label="Supprimer la ligne">&times;</button>
        </div>
    `).join('');

    // Mise à jour en temps réel
    container.querySelectorAll('input[data-field]').forEach(input => {
        input.addEventListener('input', () => {
            const idx   = parseInt(input.dataset.index, 10);
            const field = input.dataset.field;
            lignes[idx][field] = field === 'label' ? input.value : (parseFloat(input.value) || 0);
            updateTotaux();
            // Rafraîchir le sous-total de la ligne
            const row = container.querySelector(`.ligne-row[data-index="${idx}"]`);
            const totalSpan = row?.querySelector('.ligne-total');
            if (totalSpan) totalSpan.textContent = formatCurrency(lignes[idx].qte * lignes[idx].pu_ht);
        });
    });

    container.querySelectorAll('.btn-remove-ligne').forEach(btn => {
        btn.addEventListener('click', () => {
            lignes.splice(parseInt(btn.dataset.index, 10), 1);
            renderLignes();
            updateTotaux();
        });
    });
}

document.getElementById('btnAddLigne').addEventListener('click', () => {
    lignes.push({ label: '', qte: 1, pu_ht: 0 });
    renderLignes();
    updateTotaux();
    // Focus sur le dernier champ label
    const inputs = document.querySelectorAll('.ligne-label');
    inputs[inputs.length - 1]?.focus();
});

function updateTotaux() {
    const ht     = lignes.reduce((sum, l) => sum + (l.qte * l.pu_ht), 0);
    const tva    = parseFloat(document.getElementById('f_tva').value) || 0;
    const tvaAmt = ht * tva / 100;
    const ttc    = ht + tvaAmt;

    document.getElementById('totalHT').textContent  = formatCurrency(ht);
    document.getElementById('totalTVA').textContent = formatCurrency(tvaAmt);
    document.getElementById('totalTTC').textContent = formatCurrency(ttc);
}

// Recalcul si le taux TVA change
document.getElementById('f_tva').addEventListener('input', updateTotaux);

// ── Sauvegarde (création ou modification) ─────────────────────────────────────
document.getElementById('btnSaveInvoice').addEventListener('click', async () => {
    formError.classList.remove('visible');
    formError.textContent = '';

    const numero        = document.getElementById('f_numero').value.trim();
    const statut        = document.getElementById('f_statut').value;
    const client_nom    = document.getElementById('f_client_nom').value.trim();
    const client_email  = document.getElementById('f_client_email').value.trim();
    const client_tel    = document.getElementById('f_client_tel').value.trim() || null;
    const description   = document.getElementById('f_description').value.trim();
    const taux_tva      = parseFloat(document.getElementById('f_tva').value) || 0;
    const date_emission = document.getElementById('f_date_emission').value || null;
    const date_echeance = document.getElementById('f_date_echeance').value || null;
    const notes         = document.getElementById('f_notes').value.trim() || null;

    // Validation des champs obligatoires
    if (!numero || !client_nom || !client_email || !description) {
        formError.textContent = 'Veuillez remplir tous les champs obligatoires (*).';
        formError.classList.add('visible');
        return;
    }

    // Calcul des montants
    const montant_ht  = lignes.reduce((sum, l) => sum + (l.qte * l.pu_ht), 0);
    const montant_tva = montant_ht * taux_tva / 100;
    const montant_ttc = montant_ht + montant_tva;

    const payload = {
        numero,
        statut,
        client_nom,
        client_email,
        client_tel,
        description,
        lignes,
        montant_ht:  parseFloat(montant_ht.toFixed(2)),
        taux_tva,
        montant_tva: parseFloat(montant_tva.toFixed(2)),
        montant_ttc: parseFloat(montant_ttc.toFixed(2)),
        date_emission,
        date_echeance,
        notes,
    };

    const btnSave = document.getElementById('btnSaveInvoice');
    btnSave.disabled    = true;
    btnSave.textContent = 'Enregistrement…';

    try {
        let error;

        if (editingId) {
            // Mise à jour
            ({ error } = await supabase.from('invoices').update(payload).eq('id', editingId));
        } else {
            // Création — on rattache l'admin créateur
            ({ error } = await supabase.from('invoices').insert({ ...payload, created_by: adminProfile.id }));
        }

        if (error) {
            // Contrainte d'unicité sur le numéro
            formError.textContent = error.code === '23505'
                ? 'Ce numéro de facture existe déjà.'
                : `Erreur : ${error.message}`;
            formError.classList.add('visible');
            return;
        }

        closeInvoiceModal();
        loadInvoices();

    } finally {
        btnSave.disabled    = false;
        btnSave.textContent = 'Enregistrer';
    }
});

// ── Suppression ───────────────────────────────────────────────────────────────
function promptDelete(id) {
    deleteTargetId = id;
    confirmModal.classList.add('visible');
}

document.getElementById('confirmCancel').addEventListener('click', () => {
    confirmModal.classList.remove('visible');
    deleteTargetId = null;
});

document.getElementById('confirmDelete').addEventListener('click', async () => {
    if (!deleteTargetId) return;

    const { error } = await supabase.from('invoices').delete().eq('id', deleteTargetId);
    confirmModal.classList.remove('visible');
    deleteTargetId = null;

    if (!error) loadInvoices();
});

// ── Fermeture des modals ──────────────────────────────────────────────────────
document.getElementById('invoiceModalClose').addEventListener('click',  closeInvoiceModal);
document.getElementById('invoiceModalClose2').addEventListener('click', closeInvoiceModal);
invoiceModal.addEventListener('click', e => { if (e.target === invoiceModal) closeInvoiceModal(); });

// ── Bouton « Nouvelle facture » ───────────────────────────────────────────────
document.getElementById('btnNewInvoice').addEventListener('click', openCreateModal);

// ── Filtres avec debounce ─────────────────────────────────────────────────────
let debounceTimer;

function onFilterChange() {
    currentPage = 1;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadInvoices, 300);
}

filterStatut.addEventListener('change', onFilterChange);
filterSearch.addEventListener('input',  onFilterChange);

// ── Utilitaires ───────────────────────────────────────────────────────────────

/** Échappe les caractères HTML pour prévenir les injections XSS */
function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0);
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

// ── Lancement ─────────────────────────────────────────────────────────────────
loadInvoices();
