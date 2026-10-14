import { invoiceStatuses, formatCurrency, formatDate, escHtml } from './dashboard-data.js';

const byId = id => document.getElementById(id);
const setText = (id, value) => { byId(id).textContent = value; };
const plural = (count, singular, pluralForm = `${singular}s`) => `${count} ${count > 1 ? pluralForm : singular}`;

function setupMenu() {
    const sidebar = byId('sidebar');
    const toggle = byId('btnToggleSidebar');
    const backdrop = byId('sidebarBackdrop');
    const main = byId('mainContent');
    const mobile = window.matchMedia('(max-width: 768px)');
    let isOpen = false;
    function update(open, restoreFocus = true) {
        isOpen = open && mobile.matches;
        sidebar.classList.toggle('open', isOpen);
        document.body.classList.toggle('menu-open', isOpen);
        sidebar.inert = mobile.matches && !isOpen;
        main.inert = isOpen;
        backdrop.hidden = !isOpen;
        toggle.setAttribute('aria-expanded', String(isOpen));
        if (isOpen) byId('btnCloseSidebar').focus();
        else if (restoreFocus && mobile.matches) toggle.focus();
    }
    toggle.addEventListener('click', () => update(!isOpen));
    byId('btnCloseSidebar').addEventListener('click', () => update(false));
    backdrop.addEventListener('click', () => update(false));
    sidebar.addEventListener('click', event => { if (event.target.closest('a') && isOpen) update(false); });
    document.addEventListener('keydown', event => {
        if (!isOpen) return;
        if (event.key === 'Escape') { event.preventDefault(); update(false); }
        if (event.key === 'Tab') {
            const focusable = [...sidebar.querySelectorAll('a[href],button:not(:disabled)')];
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
    mobile.addEventListener('change', () => update(false, false));
    update(false, false);
}

function renderMessages(messages) {
    const body = byId('msgTableBody');
    if (!messages.length) {
        body.innerHTML = '<tr><td colspan="4" class="empty-row"><strong>Aucune demande pour le moment</strong>Les messages reçus depuis ton site apparaîtront ici.</td></tr>';
        return;
    }
    body.innerHTML = messages.map(message => `<tr>
        <td><span class="contact-name">${escHtml(message.nom || 'Contact')}</span><span class="contact-email">${escHtml(message.email)}</span></td>
        <td>${escHtml(message.sujet || 'Sans sujet')}</td>
        <td>${formatDate(message.created_at)}</td>
        <td><span class="badge ${message.traite ? 'badge-success' : 'badge-warning'}">${message.traite ? 'Traité' : 'Nouveau'}</span></td>
    </tr>`).join('');
}

function renderInvoices(invoices) {
    const body = byId('invTableBody');
    if (!invoices.length) {
        body.innerHTML = '<tr><td colspan="5" class="empty-row"><strong>Ta première facture t’attend</strong>Crée et suis tes factures depuis ton espace.<br><a href="factures.html">Accéder aux factures →</a></td></tr>';
        return;
    }
    body.innerHTML = invoices.map(invoice => {
        const status = invoiceStatuses.find(item => item.key === invoice.statut);
        return `<tr><td><code>${escHtml(invoice.numero || '—')}</code></td><td>${escHtml(invoice.client_nom || '—')}</td><td class="amount-cell"><strong>${formatCurrency(invoice.montant_ttc)}</strong></td><td><span class="badge ${status?.badge ?? 'badge-neutral'}">${escHtml(status?.singular ?? 'Autre')}</span></td><td>${formatDate(invoice.date_emission)}</td></tr>`;
    }).join('');
}

function renderMessageOverview({ total, unread }) {
    setText('kpiLeads', total);
    setText('leadsNote', unread ? `${plural(unread, 'demande')} à traiter` : 'Tous les messages sont traités');
    setText('unreadSummary', plural(unread, 'message'));
    setText('unreadBadge', unread > 0 ? unread : '');
    byId('unreadBadge').setAttribute('aria-label', `${plural(unread, 'message')} à traiter`);
}

function renderInvoiceOverview({ counts, total, paidAmount, sentAmount }) {
    setText('kpiRevenue', formatCurrency(paidAmount));
    setText('kpiPending', counts.brouillon + counts.envoyee);
    setText('kpiPaid', counts.payee);
    setText('sentSummary', plural(counts.envoyee, 'facture envoyée', 'factures envoyées'));
    setText('sentAmount', `${formatCurrency(sentAmount)} TTC à encaisser`);
    setText('draftSummary', plural(counts.brouillon, 'brouillon'));
    setText('invoiceTotal', `${plural(total, 'facture')} au total`);
    if (!total) {
        byId('invoiceDistribution').innerHTML = '<p class="empty-row">Le suivi apparaîtra après la création de ta première facture.</p>';
        return;
    }
    byId('invoiceDistribution').innerHTML = invoiceStatuses.map(({ key, label }) => `<div class="distribution-row" data-status="${key}"><div class="distribution-label"><span>${label}</span><strong>${counts[key]}</strong></div><div class="distribution-track" aria-hidden="true"><div class="distribution-fill" style="--portion:${counts[key] / total * 100}%"></div></div></div>`).join('');
}

function tableError(id, columns, label) {
    byId(id).innerHTML = `<tr><td colspan="${columns}" class="empty-row error-row">Impossible de charger ${label}. Réessaie avec le bouton Actualiser.</td></tr>`;
}

// The live entry point supplies this read-only source only after requireAdmin().
export async function mountDashboard({ profile, source, onSignOut }) {
    const name = String(profile.nom || '').trim();
    setText('adminName', name || 'Mon compte');
    setText('adminAvatar', name.charAt(0).toUpperCase() || 'C');
    setText('greetingName', name ? ` ${name.split(/\s+/)[0]}` : '');
    setText('dateDisplay', new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }));
    setupMenu();
    byId('btnSignout').addEventListener('click', async () => {
        byId('btnSignout').disabled = true;
        try { await onSignOut(); }
        catch { byId('dashboardNotice').hidden = false; setText('dashboardNotice', 'La déconnexion a échoué. Réessaie.'); }
        finally { byId('btnSignout').disabled = false; }
    });
    let refreshing = false;
    async function refresh() {
        if (refreshing) return;
        refreshing = true;
        byId('btnRefresh').disabled = true;
        byId('dashboardNotice').hidden = true;
        setText('syncStatus', 'Actualisation en cours…');
        ['metrics', 'msgTableBody', 'invTableBody'].forEach(id => byId(id).setAttribute('aria-busy', 'true'));
        const results = await Promise.allSettled([
            Promise.resolve().then(() => source.messagesOverview()).then(renderMessageOverview),
            Promise.resolve().then(() => source.invoicesOverview()).then(renderInvoiceOverview),
            Promise.resolve().then(() => source.latestMessages()).then(renderMessages),
            Promise.resolve().then(() => source.latestInvoices()).then(renderInvoices),
        ]);
        if (results[0].status === 'rejected') {
            setText('kpiLeads', '—'); setText('leadsNote', 'Données indisponibles');
            setText('unreadSummary', 'Messages indisponibles'); setText('unreadBadge', '');
        }
        if (results[1].status === 'rejected') {
            ['kpiRevenue', 'kpiPending', 'kpiPaid'].forEach(id => setText(id, '—'));
            setText('sentSummary', 'Factures indisponibles'); setText('sentAmount', 'Données indisponibles');
            setText('draftSummary', 'Brouillons indisponibles'); setText('invoiceTotal', 'Données indisponibles');
            byId('invoiceDistribution').innerHTML = '<p class="empty-row error-row">Le suivi n’a pas pu être chargé.</p>';
        }
        if (results[2].status === 'rejected') tableError('msgTableBody', 4, 'les messages');
        if (results[3].status === 'rejected') tableError('invTableBody', 5, 'les factures');
        const hasError = results.some(result => result.status === 'rejected');
        if (hasError) {
            byId('dashboardNotice').hidden = false;
            setText('dashboardNotice', 'Certaines données n’ont pas pu être chargées. Vérifie ta connexion, puis clique sur Actualiser.');
        }
        setText('syncStatus', hasError ? 'Actualisation incomplète' : `Mis à jour à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
        ['metrics', 'msgTableBody', 'invTableBody'].forEach(id => byId(id).setAttribute('aria-busy', 'false'));
        byId('btnRefresh').disabled = false;
        refreshing = false;
    }
    byId('btnRefresh').addEventListener('click', refresh);
    await refresh();
}
