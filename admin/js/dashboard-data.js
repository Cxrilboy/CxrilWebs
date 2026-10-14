export const invoiceStatuses = [
    { key: 'payee', label: 'Payées', badge: 'badge-success', singular: 'Payée' },
    { key: 'envoyee', label: 'Envoyées', badge: 'badge-warning', singular: 'Envoyée' },
    { key: 'brouillon', label: 'Brouillons', badge: 'badge-neutral', singular: 'Brouillon' },
    { key: 'annulee', label: 'Annulées', badge: 'badge-danger', singular: 'Annulée' },
];

export function summarizeInvoices(invoices) {
    const counts = Object.fromEntries(invoiceStatuses.map(({ key }) => [key, 0]));
    let paidAmount = 0;
    let sentAmount = 0;
    for (const invoice of invoices) {
        if (Object.hasOwn(counts, invoice.statut)) counts[invoice.statut] += 1;
        const parsed = Number(invoice.montant_ttc);
        const cents = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
        if (invoice.statut === 'payee') paidAmount += cents;
        if (invoice.statut === 'envoyee') sentAmount += cents;
    }
    return { counts, paidAmount: paidAmount / 100, sentAmount: sentAmount / 100, total: invoices.length };
}

function readResult(result) {
    if (result.error) throw result.error;
    return result;
}

export function createDashboardSource(client) {
    return {
        async messagesOverview() {
            const results = await Promise.all([
                client.from('form_submissions').select('*', { count: 'exact', head: true }),
                client.from('form_submissions').select('*', { count: 'exact', head: true }).eq('traite', false),
            ]);
            results.forEach(readResult);
            if (results.some(result => result.count == null)) throw new Error('Comptage indisponible');
            return { total: results[0].count, unread: results[1].count };
        },
        async invoicesOverview() {
            // Pagination avoids silently truncating totals at the API's row limit.
            const invoices = [];
            const pageSize = 500;
            for (let offset = 0; ; offset += pageSize) {
                const { data } = readResult(await client.from('invoices')
                    .select('id, montant_ttc, statut').order('id', { ascending: true })
                    .range(offset, offset + pageSize - 1));
                if (!Array.isArray(data)) throw new Error('Factures indisponibles');
                invoices.push(...data);
                if (data.length < pageSize) break;
            }
            return summarizeInvoices(invoices);
        },
        async latestMessages() {
            return readResult(await client.from('form_submissions')
                .select('id, nom, email, sujet, created_at, traite')
                .order('created_at', { ascending: false }).limit(5)).data ?? [];
        },
        async latestInvoices() {
            return readResult(await client.from('invoices')
                .select('id, numero, client_nom, montant_ttc, statut, date_emission')
                .order('created_at', { ascending: false }).limit(5)).data ?? [];
        },
    };
}

export function formatCurrency(amount) {
    const number = Number(amount);
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
        .format(Number.isFinite(number) ? number : 0);
}

export function formatDate(value) {
    if (!value) return '—';
    // Calendar dates must not shift to the previous day in Guadeloupe.
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function escHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
