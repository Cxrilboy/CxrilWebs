// PostgreSQL réel via PGlite, isolé en mémoire ; aucune connexion Supabase.
// PGLITE_MODULE peut désigner le fichier dist/index.js d'une installation de test externe au dépôt.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db = new PGlite();
let checks = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); checks++; }
async function rejected(fn) { await assert.rejects(fn); checks++; }
try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  const sql = readFileSync(new URL('../migrations/20261014_stripe_billing.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // migration réexécutable
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    for (const table of ['stripe_billing_events', 'stripe_billing_locks', 'stripe_subscriptions', 'stripe_subscription_invoices']) {
      await rejected(() => db.query(`SELECT * FROM ${table}`));
    }
    await rejected(() => db.query("SELECT cx_claim_stripe_billing('evt_x', false, 'sub_x', 'token')"));
    await db.exec('RESET ROLE');
  }
  await db.exec('SET ROLE service_role');
  const claim = async (event, token, mode = false, sub = 'sub_test') =>
    (await db.query('SELECT cx_claim_stripe_billing($1,$2,$3,$4) AS result', [event, mode, sub, token])).rows[0].result.state;
  const subscription = { id: 'sub_test', customer_id: 'cus_test', status: 'active', cancel_at_period_end: false, items: [] };
  const invoice = { id: 'in_test', subscription_id: 'sub_test', status: 'paid', amount_due: 16000, amount_paid: 16000, currency: 'eur' };
  const apply = async (event, token, sub = subscription, inv = null, mode = false, type = 'customer.subscription.updated') =>
    (await db.query('SELECT cx_apply_stripe_billing($1,$2,$3,$4,$5,$6,$7) AS result', [event, type, mode, sub.id, token, sub, inv])).rows[0].result.state;
  const rows = async table => (await db.query(`SELECT * FROM ${table} ORDER BY livemode`)).rows;
  equal(await claim('evt_first', 'one'), 'claimed');
  equal(await claim('evt_parallel', 'two'), 'busy');
  equal(await apply('evt_first', 'one'), 'applied');
  equal(await claim('evt_first', 'again'), 'duplicate');
  equal((await rows('stripe_subscriptions')).length, 1);

  equal(await claim('evt_failed', 'failed'), 'claimed');
  equal(await apply('evt_failed', 'failed', { ...subscription, status: 'past_due' }, { ...invoice, status: 'open', amount_paid: 0 }, false, 'invoice.payment_failed'), 'applied');
  equal((await rows('stripe_subscription_invoices'))[0].amount_paid_cents, 0);
  equal(await claim('evt_paid', 'paid'), 'claimed');
  equal(await apply('evt_paid', 'paid', subscription, invoice, false, 'invoice.paid'), 'applied');
  equal((await rows('stripe_subscription_invoices'))[0].amount_paid_cents, 16000);
  equal(await claim('evt_paid', 'dup'), 'duplicate');
  equal(await claim('evt_other_paid', 'other'), 'claimed');
  equal(await apply('evt_other_paid', 'other', subscription, invoice, false, 'invoice.paid'), 'applied');
  equal((await rows('stripe_subscription_invoices')).length, 1); // deux IDs d'événement, une seule facture

  equal(await claim('evt_renewal', 'renew'), 'claimed');
  equal(await apply('evt_renewal', 'renew', subscription, { ...invoice, id: 'in_renewal' }, false, 'invoice.paid'), 'applied');
  equal((await rows('stripe_subscription_invoices')).length, 2);
  equal(await claim('evt_cancel', 'cancel'), 'claimed');
  equal(await apply('evt_cancel', 'cancel', { ...subscription, status: 'canceled' }, null, false, 'customer.subscription.deleted'), 'applied');
  equal((await rows('stripe_subscriptions'))[0].status, 'canceled');
  equal((await rows('stripe_subscription_invoices')).map(r => r.status), ['paid', 'paid']);

  equal(await claim('evt_expire', 'old'), 'claimed');
  await db.exec("UPDATE stripe_billing_locks SET lease_until = now() - interval '1 second'");
  equal(await claim('evt_new', 'new'), 'claimed');
  await rejected(() => apply('evt_expire', 'old')); // ancien traitement interdit après remplacement du verrou
  equal(await apply('evt_new', 'new'), 'applied');
  equal((await db.query("SELECT count(*)::int AS n FROM stripe_billing_events WHERE stripe_event_id='evt_expire'")).rows[0].n, 0);

  equal(await claim('evt_atomic', 'atomic'), 'claimed');
  await rejected(() => apply('evt_atomic', 'atomic', subscription, { ...invoice, amount_paid: 'invalid' }));
  equal((await db.query("SELECT count(*)::int AS n FROM stripe_billing_events WHERE stripe_event_id='evt_atomic'")).rows[0].n, 0);
  equal(await apply('evt_atomic', 'atomic', subscription, { ...invoice, id: 'in_zero', amount_paid: 0, amount_due: 0 }), 'applied');
  equal((await db.query("SELECT amount_paid_cents FROM stripe_subscription_invoices WHERE stripe_invoice_id='in_zero'")).rows[0].amount_paid_cents, 0);

  equal(await claim('evt_first', 'live', true), 'claimed');
  equal(await apply('evt_first', 'live', subscription, null, true), 'applied');
  equal((await rows('stripe_subscriptions')).length, 2); // isolation test/live
  equal((await rows('stripe_billing_locks')).length, 0);
  console.log(`PASS: ${checks} assertions PostgreSQL, migration réexécutable, permissions et transactions vérifiées.`);
} finally { await db.close(); }
