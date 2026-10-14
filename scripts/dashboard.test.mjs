import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../admin/js/dashboard-data.js', import.meta.url), 'utf8');
const { summarizeInvoices, createDashboardSource, formatDate, escHtml } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('paid amounts exclude sent, draft and cancelled invoices; cents stay exact', () => {
    const summary = summarizeInvoices([
        { statut: 'payee', montant_ttc: '0.10' }, { statut: 'payee', montant_ttc: '0.20' },
        { statut: 'envoyee', montant_ttc: '250.50' }, { statut: 'brouillon', montant_ttc: 800 },
        { statut: 'annulee', montant_ttc: 999 },
    ]);
    assert.deepEqual(summary, { counts: { payee: 2, envoyee: 1, brouillon: 1, annulee: 1 }, paidAmount: .3, sentAmount: 250.5, total: 5 });
    assert.equal(summarizeInvoices([]).paidAmount, 0);
});

test('overview reads every page beyond the default API row limit', async () => {
    const rows = Array.from({ length: 1201 }, (_, id) => ({ id, statut: 'payee', montant_ttc: 10 }));
    const ranges = [];
    const client = { from() { return { select() { return this; }, order() { return this; }, async range(start, end) { ranges.push([start, end]); return { data: rows.slice(start, end + 1), error: null }; } }; } };
    const overview = await createDashboardSource(client).invoicesOverview();
    assert.equal(overview.paidAmount, 12010);
    assert.equal(overview.counts.payee, 1201);
    assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]]);
});

test('query failures remain errors, never an empty or zero dashboard', async () => {
    const failure = { error: new Error('Unavailable'), data: null, count: null };
    const query = { select() { return this; }, order() { return this; }, eq() { return this; }, range() { return this; }, limit() { return this; }, then(resolve) { return Promise.resolve(failure).then(resolve); } };
    const source = createDashboardSource({ from: () => query });
    for (const read of Object.values(source)) await assert.rejects(read, /Unavailable/);
});

test('invoice calendar dates keep their day in Guadeloupe', () => {
    process.env.TZ = 'America/Guadeloupe';
    assert.match(formatDate('2026-09-15'), /^15 /);
    assert.equal(formatDate('not-a-date'), '—');
    assert.equal(formatDate(null), '—');
});

test('customer-provided text is escaped before rendering', () => {
    assert.equal(escHtml('<img src=x onerror="bad()"> & O\'Neil'), '&lt;img src=x onerror=&quot;bad()&quot;&gt; &amp; O&#039;Neil');
});
