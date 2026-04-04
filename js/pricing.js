/**
 * pricing.js — Source unique de vérité pour les prix CxrilWebs
 * Importé dans index.html, devis.html et paiement.html
 *
 * Modifier UN prix ici le met à jour sur les 3 pages simultanément.
 */
const PRICING_CONFIG = {
  web: {
    express:   { price: 290,  label: 'Site Express',        acompte: 0.30, mode: 'payment' },
    vitrine:   { price: 890,  label: 'Site Vitrine',       acompte: 0.30, mode: 'payment' },
    ecommerce: { price: 1690, label: 'Site E-commerce',    acompte: 0.30, mode: 'payment' },
    appWeb:    { price: null, label: 'Projet web sur mesure', acompte: 0.30, mode: 'ondemand' },
  },
  webOptions: {
    pages610:    { price: 90,  label: 'Pages 6–10'             },
    pages10plus: { price: 190, label: 'Pages 10+'              },
    design:      { price: 120, label: 'Design sur mesure'      },
    seo:         { price: 149, label: 'SEO on-page'            },
    blog:        { price: 60,  label: 'Blog intégré'           },
    contact:     { price: 30,  label: 'Formulaire avancé'      },
    multilingue: { price: 90,  label: 'Site multilingue'       },
    hebergement: { price: 25,  label: 'Hébergement 1 an'       },
  },
  maintenance: {
    ponctuel: { price: 80,   label: 'Intervention Ponctuelle', acompte: 1.00, mode: 'payment'      },
    mensuel:  { price: 150,  label: 'Contrat Mensuel',         acompte: 1.00, mode: 'subscription' },
    annuel:   { price: 1490, label: 'Contrat Annuel',          acompte: 1.00, mode: 'payment'      },
  },
  maintenanceOptions: {
    monitoring:      { price: 20, label: 'Monitoring uptime 24/7'              },
    sauvegardesAuto: { price: 15, label: 'Sauvegardes automatiques quotidiennes' },
    majCms:          { price: 25, label: 'Mises à jour CMS & plugins'          },
    rapportMensuel:  { price: 10, label: 'Rapport mensuel détaillé'            },
  },
  social: {
    basic:     { price: 160,  label: 'Forfait Basic',     acompte: 1.00, mode: 'subscription' },
    plus:      { price: 320,  label: 'Forfait Plus',      acompte: 1.00, mode: 'subscription' },
    facebook:  { price: 120,  label: 'Création Facebook', acompte: 1.00, mode: 'payment'      },
    instagram: { price: 100,  label: 'Création Instagram',acompte: 1.00, mode: 'payment'      },
    tiktok:    { price: 150,  label: 'Création TikTok',   acompte: 1.00, mode: 'payment'      },
    publications: { price: null, label: 'à partir de 150€/mois', mode: 'subscription' },
    combo:     { price: null, label: 'à partir de 220€/mois', mode: 'subscription' },
    ads:       { price: 400,  label: 'Campagnes Pub',     acompte: 1.00, mode: 'payment'      },
  },
  // Affichage index.html #tarifs uniquement
  tarifs: {
    web:         { price: 290,  display: 'À partir de 290€' },
    maintenance: { price: 80,   display: 'À partir de 80€' },
    social:      { price: 80,   display: 'À partir de 80€' },
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

