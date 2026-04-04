/**
 * Construit dynamiquement les liens paiement.html depuis les données du devis
 * Appelé automatiquement au chargement de devis.html
 */
(function() {
    document.addEventListener('DOMContentLoaded', function() {
        var stripeAltLink = document.getElementById('stripeAltLinkHref');
        var btnPayer = document.getElementById('btn-payer');

        // Mapping service+formule → clé PRICING_CONFIG et segment URL
        var formulaMap = {
            web:         { vitrine: 'vitrine', ecommerce: 'ecommerce', app: 'app' },
            maintenance: { ponctuelle: 'site_ponctuelle', mensuelle: 'site_mensuelle', annuelle: 'site_annuelle' },
            'reseaux-sociaux': { creation: null, gestion: null, pack: null }
        };

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
            var fKey   = formula === 'app' ? 'appWeb' : formula;
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
                cfg = PRICING_CONFIG.maintenance[formula];
            } else if (service === 'reseaux-sociaux') {
                cfg = PRICING_CONFIG.social[formula];
            }
            return cfg ? cfg.label : formula;
        }

        function updatePaymentLinks() {
            setTimeout(function() {
                try {
                    var totalEl = document.getElementById('totalPrice');
                    var ttcEl = document.getElementById('totalPriceTTC');
                    var acompteEl = document.getElementById('stripeAcompteValue');
                    if (!totalEl || !ttcEl) return;

                    var ttcText = ttcEl.textContent;
                    var ttc = parseFloat(ttcText) || 0;
                    var service = (document.querySelector('input[name="service"]:checked') || {}).value || 'web';
                    var formula = getFormula(service);
                    var description = getDescription(service, formula);

                    // Lien mode express (stripeAltLink)
                    if (stripeAltLink && ttc > 0) {
                        var modeAlt = getMode(service, formula);
                        var acompte = Math.round(ttc * 0.30);
                        stripeAltLink.href = 'paiement.html?service=' + service
                                + '&total=' + ttc + '&acompte=' + acompte + '&mode=' + modeAlt;
                    }

                    // Bouton "Procéder au paiement" (avec formula + description)
                    if (btnPayer && ttc > 0) {
                        var mode = getMode(service, formula);
                        var href = 'paiement.html?service=' + service + '&total=' + ttc;
                        if (formula) href += '&formula=' + encodeURIComponent(formula);
                        if (description) href += '&description=' + encodeURIComponent(description);
                        href += '&mode=' + mode;
                        btnPayer.href = href;
                        btnPayer.style.display = '';
                    }
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
