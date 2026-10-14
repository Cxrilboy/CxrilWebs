/**
 * pricing.js — Prix affichés CxrilWebs (index, devis, paiement)
 *
 * Ces valeurs servent à l'affichage uniquement. Le montant réellement facturé par Stripe est
 * toujours recalculé par api/create-checkout-session.php, qui doit rester identique à ce fichier
 * (contrôlé par scripts/pricing-consistency.test.mjs).
 */
const PRICING_CONFIG = {
  web: {
    express:   { price: 290,  label: 'Site Express',        acompte: 0.30, mode: 'payment' },
    vitrine:   { price: 890,  label: 'Site Vitrine',       acompte: 0.30, mode: 'payment' },
    ecommerce: { price: 1690, label: 'Site E-commerce',    acompte: 0.30, mode: 'payment' },
    // Projet sur mesure : sur devis uniquement, jamais envoyé à Stripe.
    appWeb:    { price: null, startingPrice: 2990, label: 'Application web — À partir de 2 990 € — Sur devis', acompte: 0.30, mode: 'ondemand' },
  },
  // Express : une page uniquement. Vitrine/E-commerce : 1–5 pages incluses.
  webPages: { '1': 0, '1-5': 0, '6-10': 90, '10+': 190 },
  // Options du devis web : identifiant = data-opt de devis.html = identifiant accepté par l'API.
  // "for" : formules (clés de paiement) auxquelles l'option s'applique.
  webOptions: {
    'seo-avance':        { price: 190, label: 'SEO avancé',                       for: ['web_express', 'web_vitrine'] },
    'formulaire-avance': { price: 60,  label: 'Formulaire de contact avancé',     for: ['web_express', 'web_vitrine'] },
    'animations':        { price: 80,  label: 'Animations & effets visuels',      for: ['web_express', 'web_vitrine'] },
    'hebergement':       { price: 60,  label: 'Hébergement 1 an',                 for: ['web_express', 'web_vitrine'] },
    'blog':              { price: 120, label: 'Blog intégré',                     for: ['web_vitrine'] },
    'galerie':           { price: 90,  label: 'Galerie photos',                   for: ['web_vitrine'] },
    'stock-avance':      { price: 120, label: 'Gestion de stock avancée',         for: ['web_ecommerce'] },
    'fiches-avancees':   { price: 100, label: 'Fiches produits enrichies',        for: ['web_ecommerce'] },
    'multidevise':       { price: 80,  label: 'Multi-devises',                    for: ['web_ecommerce'] },
    'seo-ecom':          { price: 190, label: 'SEO e-commerce avancé',            for: ['web_ecommerce'] },
    'avis-clients':      { price: 70,  label: "Système d'avis clients",           for: ['web_ecommerce'] },
  },
  // Maintenance — clés de paiement : maintenance_site_ponctuel / _mensuel / _annuel (cf. api/create-checkout-session.php).
  // Monitoring, sauvegardes et mises à jour CMS/plugins sont inclus dans le mensuel et l'annuel.
  maintenance: {
    ponctuel: { price: 80,   label: 'Intervention ponctuelle', acompte: 1.00, mode: 'payment'      },
    mensuel:  { price: 150,  label: 'Maintenance mensuelle',   acompte: 1.00, mode: 'subscription' },
    annuel:   { price: 1490, label: 'Maintenance annuelle',    acompte: 1.00, mode: 'payment'      },
  },
  maintenanceOptions: {
    rapportMensuel:  { price: 10, label: 'Rapport mensuel détaillé' },
  },
  social: {
    basic:     { price: 160,  label: 'Forfait Basic',     acompte: 1.00, mode: 'subscription' },
    plus:      { price: 320,  label: 'Forfait Plus',      acompte: 1.00, mode: 'subscription' },
    facebook:  { price: 120,  label: 'Création Facebook', acompte: 1.00, mode: 'payment'      },
    instagram: { price: 100,  label: 'Création Instagram',acompte: 1.00, mode: 'payment'      },
    tiktok:    { price: 150,  label: 'Création TikTok',   acompte: 1.00, mode: 'payment'      },
    linkedin:  { price: 80,   label: 'Création LinkedIn', acompte: 1.00, mode: 'payment'      },
  },
  // Affichage index.html #tarifs uniquement
  tarifs: {
    web:         { price: 290,  display: 'À partir de 290€' },
    maintenance: { price: 80,   display: 'À partir de 80€' },
    social:      { price: 80,   display: 'À partir de 80 € — prestations ponctuelles' },
    essentiel:   { price: 890,  display: 'À partir de 890€' },
    pro:         { price: 1690, display: 'À partir de 1 690€' },
    entreprise:  { price: null, display: 'Sur devis'        },
  }
};

/**
 * Injecte les prix depuis PRICING_CONFIG dans les éléments portant
 * un attribut data-price-key (ex. data-price-key="web.vitrine.price").
 * Le dernier segment "price" ajoute automatiquement "€" au nombre.
 */
(function injectPrices() {
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-price-key]').forEach(function (el) {
      var key = el.getAttribute('data-price-key'); // ex. "web.vitrine.price"
      var parts = key.split('.');
      var val = PRICING_CONFIG;
      for (var i = 0; i < parts.length; i++) {
        if (val == null) return;
        val = val[parts[i]];
      }
      if (val != null) {
        var isPrice = parts[parts.length - 1] === 'price' && typeof val === 'number';
        el.textContent = isPrice ? val + '€' : val;
      }
    });
  });
})();

