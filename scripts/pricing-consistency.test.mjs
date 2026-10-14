// Contrôle de cohérence des formules payables : catalogue serveur (PHP) ↔ pricing.js ↔ devis ↔ paiement ↔ merci.
// Lancer : node --test scripts/pricing-consistency.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const php = read('api/create-checkout-session.php');
const pricingSource = read('js/pricing.js');
const devisHtml = read('devis.html');
const paiementHtml = read('paiement.html');
const merciHtml = read('merci.html');
const paymentLinks = read('js/devis-payment-links.js');

const PRICING = vm.runInNewContext(pricingSource + '\n;PRICING_CONFIG', { document: { addEventListener() {} } });

// Catalogue PHP : clé → { amount|total, mode, record }
const catalog = {};
for (const m of php.matchAll(/'((?:web|maintenance|rs)_[a-z_]+)' => \[([^\n]*?)\],\n/g)) {
  const body = m[2];
  const number = name => { const x = body.match(new RegExp(`'${name}' => (\\d+)`)); return x ? Number(x[1]) : null; };
  catalog[m[1]] = {
    amount: number('amount'),
    total: number('total'),
    mode: body.match(/'mode' => '(\w+)'/)[1],
    record: body.match(/'record' => '(\w+)'/)[1],
    env: body.match(/'env' => '(\w+)'/)[1],
  };
}

const phpPages = Object.fromEntries([...php.match(/\$webPages = \[([^\]]*)\]/)[1].matchAll(/'([^']+)' => (\d+)/g)].map(m => [m[1], Number(m[2])]));
const phpOptions = {};
for (const m of php.matchAll(/'([a-z-]+)' => \['price' => (\d+), 'for' => \[([^\]]*)\]\]/g)) {
  phpOptions[m[1]] = { price: Number(m[2]), for: [...m[3].matchAll(/'(\w+)'/g)].map(x => x[1]) };
}

test('catalogue serveur : prix et modes attendus', () => {
  assert.deepEqual(Object.keys(catalog).sort(), [
    'maintenance_site_annuel', 'maintenance_site_mensuel', 'maintenance_site_ponctuel',
    'rs_basic', 'rs_facebook', 'rs_instagram', 'rs_linkedin', 'rs_plus', 'rs_tiktok',
    'web_ecommerce', 'web_express', 'web_vitrine',
  ]);
  const expected = {
    web_express: ['total', 290, 'payment'], web_vitrine: ['total', 890, 'payment'], web_ecommerce: ['total', 1690, 'payment'],
    maintenance_site_ponctuel: ['amount', 80, 'payment'], maintenance_site_mensuel: ['amount', 150, 'subscription'], maintenance_site_annuel: ['amount', 1490, 'payment'],
    rs_basic: ['amount', 160, 'subscription'], rs_plus: ['amount', 320, 'subscription'],
    rs_facebook: ['amount', 120, 'payment'], rs_instagram: ['amount', 100, 'payment'], rs_tiktok: ['amount', 150, 'payment'],
    rs_linkedin: ['amount', 80, 'payment'],
  };
  for (const [key, [field, value, mode]] of Object.entries(expected)) {
    assert.equal(catalog[key][field], value, `${key} ${field}`);
    assert.equal(catalog[key].mode, mode, `${key} mode`);
  }
  assert.equal(catalog.web_app, undefined, 'le projet sur mesure ne doit pas être payable');
});

test('acompte web : 30 % en centimes, sans arrondi flottant', () => {
  assert.deepEqual([290, 890, 1690].map(total => total * 30), [8700, 26700, 50700]);
  const types = ['web_express', 'web_vitrine', 'web_ecommerce'];
  for (const type of types) {
    const allowed = Object.entries(phpOptions).filter(([, o]) => o.for.includes(type)).map(([id, o]) => o.price);
    for (const pagesPrice of (type === 'web_express' ? [0] : Object.values(phpPages))) {
      for (let mask = 0; mask < (1 << allowed.length); mask++) {
        const total = catalog[type].total + pagesPrice + allowed.reduce((s, p, i) => s + ((mask >> i) & 1 ? p : 0), 0);
        const cents = total * 30;
        assert.ok(Number.isInteger(cents));
        assert.equal(cents, Math.round(total * 100 * 0.3), `${type} ${total}`);
        assert.equal(cents % 100, 0, 'tous les prix sont des multiples de 10 € : acompte en euros entiers');
      }
    }
  }
});

test('pricing.js = serveur (web, pages, options, maintenance, réseaux sociaux)', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(PRICING.webPages)), phpPages);
  assert.deepEqual(JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(PRICING.webOptions).map(([k, v]) => [k, { price: v.price, for: v.for }])))), phpOptions);
  for (const t of ['express', 'vitrine', 'ecommerce']) assert.equal(PRICING.web[t].price, catalog['web_' + t].total);
  for (const t of ['ponctuel', 'mensuel', 'annuel']) {
    assert.equal(PRICING.maintenance[t].price, catalog['maintenance_site_' + t].amount);
    assert.equal(PRICING.maintenance[t].mode, catalog['maintenance_site_' + t].mode);
  }
  for (const t of ['basic', 'plus', 'facebook', 'instagram', 'tiktok', 'linkedin']) {
    assert.equal(PRICING.social[t].price, catalog['rs_' + t].amount, t);
    assert.equal(PRICING.social[t].mode, catalog['rs_' + t].mode, t);
  }
  assert.equal(PRICING.web.appWeb.price, null);
});

test('devis.html : prix des types, pages et options = serveur', () => {
  for (const m of devisHtml.matchAll(/name="web-type" id="web-(\w+)" value="(\w+)" data-price="(\d+)"/g)) {
    if (m[2] === 'app') continue;
    assert.equal(Number(m[3]), catalog['web_' + m[2]].total, m[2]);
  }
  for (const m of devisHtml.matchAll(/name="web-pages" id="[^"]+" value="([^"]+)" data-price="(\d+)"/g)) {
    assert.equal(Number(m[2]), phpPages[m[1]], 'pages ' + m[1]);
  }
  const panels = { 'opts-express': 'web_express', 'opts-vitrine': 'web_vitrine', 'opts-ecom': 'web_ecommerce' };
  let seen = 0;
  for (const [panelId, key] of Object.entries(panels)) {
    const start = devisHtml.indexOf(`id="${panelId}"`);
    const next = devisHtml.indexOf('class="options-group"', start);
    const end = next === -1 ? devisHtml.indexOf('devis-reassurance-bar', start) : next;
    const block = devisHtml.slice(start, end);
    const ids = [...block.matchAll(/name="opt-web" data-opt="([a-z-]+)" data-price="(\d+)"/g)];
    assert.ok(ids.length > 0, panelId);
    for (const [, id, price] of ids) {
      seen++;
      assert.ok(phpOptions[id], `option inconnue du serveur : ${id}`);
      assert.equal(Number(price), phpOptions[id].price, id);
      assert.ok(phpOptions[id].for.includes(key), `${id} non autorisée pour ${key}`);
    }
    // toute option autorisée par le serveur pour cette formule est proposée dans le devis
    const offered = ids.map(x => x[1]);
    for (const [id, o] of Object.entries(phpOptions)) if (o.for.includes(key)) assert.ok(offered.includes(id), `${id} manque dans ${panelId}`);
  }
  assert.ok(seen >= 10);
  // projet sur mesure : jamais dans le catalogue ni dans les liens de paiement
  assert.ok(/type === 'app'\) return \{ url: null/.test(paymentLinks));
});

test('devis.html : maintenance et réseaux sociaux = serveur', () => {
  for (const m of devisHtml.matchAll(/name="contrat-maintenance" id="[^"]+" value="(\w+)" data-price="(\d+)"/g)) {
    assert.equal(Number(m[2]), catalog['maintenance_site_' + m[1]].amount, m[1]);
  }
  for (const m of devisHtml.matchAll(/name="plateforme-rs" id="[^"]+" value="(\w+)" data-price-creation="(\d+)"/g)) {
    assert.equal(Number(m[2]), catalog['rs_' + m[1]].amount, m[1]);
  }
  for (const m of devisHtml.matchAll(/name="forfait-rs" id="[^"]+" value="(\w+)" data-price="(\d+)"/g)) {
    assert.equal(Number(m[2]), catalog['rs_' + m[1]].amount, m[1]);
  }
});

test('liens devis → paiement : chaque formule générée existe côté serveur', () => {
  const generated = [];
  for (const t of ['express', 'vitrine', 'ecommerce']) generated.push('web_' + t);
  for (const m of devisHtml.matchAll(/name="contrat-maintenance" id="[^"]+" value="(\w+)"/g)) generated.push('maintenance_site_' + m[1]);
  for (const m of devisHtml.matchAll(/name="plateforme-rs" id="[^"]+" value="(\w+)"/g)) generated.push('rs_' + m[1]);
  for (const m of devisHtml.matchAll(/name="forfait-rs" id="[^"]+" value="(\w+)"/g)) generated.push('rs_' + m[1]);
  assert.ok(generated.length >= 12);
  for (const key of generated) assert.ok(catalog[key], `formule générée sans équivalent serveur : ${key}`);
});

test('paiement.html : cartes, configuration et catalogue serveur alignés', () => {
  const cards = [...paiementHtml.matchAll(/class="pay-option-card([^"]*)" data-key="(\w+)"/g)].map(m => ({ key: m[2], disabled: m[1].includes('pay-option-disabled') }));
  const payable = cards.filter(c => !c.disabled).map(c => c.key).sort();
  assert.deepEqual(payable, Object.keys(catalog).sort(), 'chaque carte payable a une formule serveur et inversement');
  assert.deepEqual(cards.filter(c => c.disabled).map(c => c.key), ['web_app', 'rs_ads']);

  const configBlock = paiementHtml.slice(paiementHtml.indexOf('function getOptionConfig'));
  const configKeys = [...configBlock.matchAll(/^\s*(?:var opts = \{\s*)?((?:web|maintenance|rs)_\w+):\s*\{/gm)].map(m => m[1]);
  const inline = [...configBlock.matchAll(/((?:web|maintenance|rs)_\w+):\s*\{ icon/g)].map(m => m[1]);
  const all = [...new Set([...configKeys, ...inline])].sort();
  assert.deepEqual(all.filter(k => k !== 'web_app'), Object.keys(catalog).sort(), 'aucune formule fantôme dans getOptionConfig');
  for (const ghost of ['rs_audit', 'rs_mensuel', 'rs_annuel']) assert.ok(!paiementHtml.includes(ghost), ghost);

  for (const line of configBlock.split('\n')) {
    for (const m of line.matchAll(/((?:web|maintenance|rs)_\w+):\s*\{ icon([^}]*)\}/g)) {
      const [, key, body] = m;
      const c = catalog[key];
      if (!c) continue;
      const totalRaw = Number(body.match(/totalRaw:\s*(\d+)/)[1]);
      const depositRaw = Number(body.match(/depositRaw:\s*(\d+)/)[1]);
      if (c.total) {
        assert.equal(totalRaw, c.total, key);
        assert.equal(depositRaw * 100, c.total * 30, `acompte ${key}`);
      } else {
        assert.equal(depositRaw, c.amount, key);
      }
      assert.equal(/isSubscription:\s*true/.test(body), c.mode === 'subscription', `${key} abonnement`);
    }
  }
  // les formules acceptées en pré-sélection depuis un lien sont exactement les formules payables
  const prefill = paiementHtml.match(/var keyMap = \{([\s\S]*?)\};/)[1];
  const prefillKeys = [...prefill.matchAll(/(?:^|[{ ,])((?:web|maintenance|rs)_\w+): '/g)].map(m => m[1]);
  assert.deepEqual([...new Set(prefillKeys)].sort(), Object.keys(catalog).sort());
  assert.ok(!/web_app|appweb|'app'/.test(prefill), 'pas de pré-sélection du projet sur mesure');
});

test('merci.html connaît toutes les formules payables', () => {
  const content = merciHtml.slice(merciHtml.indexOf('var CONTENT = {'));
  for (const key of Object.keys(catalog)) assert.ok(new RegExp(`\\b${key}:`).test(content), `merci.html : ${key}`);
  assert.ok(!/web_app/.test(content));
});

function quoteTarget(values, selectedOptions = []) {
  const context = { window: {}, document: {
    addEventListener() {},
    querySelector(selector) {
      const name = selector.match(/name="([^"]+)"/)?.[1];
      return values[name] ? { value: values[name] } : null;
    },
    querySelectorAll(selector) {
      return selector.includes('opt-rs') ? selectedOptions.map(id => ({ dataset: { opt: id } })) : [];
    },
  } };
  vm.runInNewContext(paymentLinks, context);
  return context.window.cxDevisPaymentTarget();
}

test('devis : application, publicité, options sociales et packs ne génèrent aucun lien de paiement', () => {
  assert.equal(quoteTarget({ service: 'web', 'web-type': 'app' }).url, null);
  for (const option of ['pub-fb', 'pub-ig', 'moderation-rs', 'stories']) {
    for (const forfait of ['basic', 'plus']) {
      assert.equal(quoteTarget({ service: 'reseaux-sociaux', 'objectif-rs': 'gestion', 'plateforme-rs': 'facebook', 'forfait-rs': forfait }, [option]).url, null);
    }
  }
  assert.equal(quoteTarget({ service: 'reseaux-sociaux', 'objectif-rs': 'pack', 'plateforme-rs': 'instagram', 'forfait-rs': 'plus' }).url, null);
  for (const forfait of ['basic', 'plus']) assert.match(quoteTarget({ service: 'reseaux-sociaux', 'objectif-rs': 'gestion', 'forfait-rs': forfait }).url, new RegExp('formula=rs_' + forfait));
  for (const platform of ['facebook', 'instagram', 'tiktok', 'linkedin']) assert.match(quoteTarget({ service: 'reseaux-sociaux', 'objectif-rs': 'creation', 'plateforme-rs': platform }).url, new RegExp('formula=rs_' + platform));
});

test('Express : seul le choix une page peut être transmis au paiement', () => {
  for (const pages of ['1-5', '6-10', '10+']) assert.equal(quoteTarget({ service: 'web', 'web-type': 'express', 'web-pages': pages }).url, null);
  assert.match(quoteTarget({ service: 'web', 'web-type': 'express', 'web-pages': '1' }).url, /formula=web_express&pages=1/);
  for (const type of ['vitrine', 'ecommerce']) for (const pages of ['6-10', '10+']) assert.ok(quoteTarget({ service: 'web', 'web-type': type, 'web-pages': pages }).url);
});

test('paiement : les options Express falsifiées sont refusées avant le récapitulatif', () => {
  const source = paiementHtml.match(/function readWebExtrasFromURL\(key\) \{[\s\S]*?\n        \}/)[0];
  for (const pages of ['1-5', '6-10', '10+', '2']) {
    const context = { PRICING_CONFIG: PRICING, urlParams: new URLSearchParams({ pages }) };
    assert.equal(vm.runInNewContext(source + ";readWebExtrasFromURL('web_express')", context).ok, false);
  }
  assert.equal(vm.runInNewContext(source + ";readWebExtrasFromURL('web_express')", { PRICING_CONFIG: PRICING, urlParams: new URLSearchParams({ pages: '1', options: 'seo-avance' }) }).ok, true);
});

test('changement Vitrine → Express → Vitrine : pages masquées, désactivées et décochées', () => {
  let type = 'express';
  const inputs = ['1', '1-5', '6-10', '10+'].map(value => ({ value, checked: value === '10+', disabled: false, label: { style: {} }, closest() { return this.label; } }));
  const form = { querySelector() { return type === 'express' ? {} : null; }, querySelectorAll() { return inputs; } };
  const source = read('devis.js').match(/function updateWebPages\(\) \{[\s\S]*?\n    \}/)[0];
  const context = vm.createContext({ form });
  vm.runInContext(source + ';updateWebPages()', context);
  assert.equal(inputs[0].checked, true);
  for (const input of inputs.slice(1)) { assert.equal(input.disabled, true); assert.equal(input.checked, false); assert.equal(input.label.style.display, 'none'); }
  type = 'vitrine';
  vm.runInContext('updateWebPages()', context);
  assert.equal(inputs[0].disabled, true);
  assert.equal(inputs[0].checked, false);
  for (const input of inputs.slice(1)) { assert.equal(input.disabled, false); assert.equal(input.label.style.display, ''); }
});

test('publicité : prix inconnu explicitement indiqué, jamais affiché comme zéro euro', () => {
  for (const id of ['pub-fb', 'pub-ig']) {
    const input = devisHtml.match(new RegExp(`<input[^>]*data-opt="${id}"[^>]*>`))[0];
    assert.match(input, /data-on-demand="true"/);
    assert.doesNotMatch(input, /data-price=/);
  }
  assert.equal(catalog.rs_ads, undefined);
  assert.equal(PRICING.social.ads, undefined);
  assert.equal(PRICING.web.appWeb.startingPrice, 2990);
  assert.match(read('devis.js'), /item.onDemand \? 'Sur devis'/);
  assert.match(devisHtml, /À partir de 2 990 € — Sur devis/);
});

test('E-commerce : cinq pages incluses annoncées sur le devis et le paiement', () => {
  assert.match(read('devis.html'), /Jusqu'à 5 pages incluses/);
  assert.match(read('paiement.html'), /Jusqu'à 5 pages incluses/);
  assert.doesNotMatch(read('paiement.html'), /Jusqu'à 10 pages/);
});

test('syntaxe des scripts JS et des scripts intégrés aux pages', () => {
  for (const file of ['devis.js', 'js/pricing.js', 'js/checkout.js', 'js/devis-payment-links.js']) new vm.Script(read(file), { filename: file });
  for (const file of ['paiement.html', 'merci.html']) {
    for (const match of read(file).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (!/src=|application\/ld\+json/.test(match[1])) new vm.Script(match[2], { filename: file });
    }
  }
});

test('Checkout : le navigateur transmet uniquement des identifiants, jamais de montant', async () => {
  let request, redirected;
  const context = vm.createContext({
    document: { getElementById() { return null; } },
    AbortController, setTimeout, clearTimeout,
    window: { location: { assign(url) { redirected = url; } } },
    fetch: async (url, init) => { request = { url, init }; return { ok: true, json: async () => ({ url: 'https://checkout.example.test/session' }) }; },
    alert(message) { throw new Error(message); }, console,
  });
  vm.runInContext(read('js/checkout.js'), context);
  await context.startCheckout({ priceKey: 'web_vitrine', webPages: '6-10', webOptions: ['blog'], amount: 1, total: 1, deposit: 1, mode: 'subscription' });
  assert.equal(request.url, '/api/create-checkout-session.php');
  assert.deepEqual(JSON.parse(request.init.body), { priceKey: 'web_vitrine', webPages: '6-10', webOptions: ['blog'] });
  assert.equal(redirected, 'https://checkout.example.test/session');
});
