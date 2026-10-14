/**
 * Construit dynamiquement les liens paiement.html depuis les données du devis
 * Appelé automatiquement au chargement de devis.html
 */
(function() {
    document.addEventListener('DOMContentLoaded', function() {
        var stripeAltLink = document.getElementById('stripeAltLinkHref');
        var btnPayer = document.getElementById('btn-payer');

        // Mapping service+formule → formule transmise à paiement.html
        // Maintenance : clés identiques à celles du catalogue de paiement et de l'API Stripe.
        var formulaMap = {
            web:         { vitrine: 'vitrine', ecommerce: 'ecommerce', app: 'app' },
            maintenance: { ponctuel: 'maintenance_site_ponctuel', mensuel: 'maintenance_site_mensuel', annuel: 'maintenance_site_annuel' },
            'reseaux-sociaux': { creation: null, gestion: null, pack: null }
        };

        // 'maintenance_site_mensuel' → 'mensuel' (clé de PRICING_CONFIG.maintenance)
        function pricingFormula(service, formula) {
            return service === 'maintenance' ? String(formula || '').replace('maintenance_site_', '') : formula;
        }

        function getFormula(service) {
            var maps = {
                web:             document.querySelector('input[name="web-type"]:checked'),
                maintenance:     document.querySelector('input[name="contrat-maintenance"]:checked'),
                'reseaux-sociaux': document.querySelector('input[name="objectif-rs"]:checked')
            };
            var input = maps[service];
            if (!input) return null;
            var serviceMap = formulaMap[service] || {};
            return serviceMap[input.value] || input.value;
        }

        function getMode(service, formula) {
            var svcKey = service === 'web' ? 'web' : service === 'maintenance' ? 'maintenance' : 'social';
            var fKey   = formula === 'app' ? 'appWeb' : pricingFormula(service, formula);
            var cfg    = PRICING_CONFIG[svcKey] && PRICING_CONFIG[svcKey][fKey];
            return cfg ? (cfg.mode || 'payment') : 'payment';
        }

        function getDescription(service, formula) {
            if (!formula) return service;
            var cfg = null;
            if (service === 'web') {
                var k = formula === 'vitrine' ? 'vitrine' : formula === 'ecommerce' ? 'ecommerce' : 'appWeb';
                cfg = PRICING_CONFIG.web[k];
            } else if (service === 'maintenance') {
                cfg = PRICING_CONFIG.maintenance[pricingFormula(service, formula)];
            } else if (service === 'reseaux-sociaux') {
                cfg = PRICING_CONFIG.social[formula];
            }
            return cfg ? cfg.label : formula;
        }

        function updatePaymentLinks() {
            setTimeout(function() {
                try {
                    var totalEl = document.getElementById('totalPrice');
                    if (!totalEl) return;
                    var service = (document.querySelector('input[name="service"]:checked') || {}).value || 'web';
                    var formula = getFormula(service);
                    var href = 'paiement.html?service=' + encodeURIComponent(service);
                    if (formula) href += '&formula=' + encodeURIComponent(formula);
                    if (stripeAltLink) stripeAltLink.href = href;
                    if (btnPayer) { btnPayer.href = href; btnPayer.style.display = ''; }
                } catch (e) {
                    console.error('Erreur mise à jour liens paiement:', e);
                }
            }, 100);
        }

        // Mise à jour initiale et observateur sur le montant affiché
        updatePaymentLinks();
        var ttcEl = document.getElementById('totalPriceTTC');
        if (ttcEl) {
            var observer = new MutationObserver(updatePaymentLinks);
            observer.observe(ttcEl, { childList: true, characterData: true, subtree: true });
        }
    });
})();
