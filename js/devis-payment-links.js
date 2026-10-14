/**
 * Liens devis → paiement.html (point unique de construction).
 *
 * - formula = clé du catalogue de api/create-checkout-session.php (web_vitrine, maintenance_site_mensuel, rs_basic…).
 * - Création de site : pages/options ne sont que des identifiants. Le serveur recalcule total et acompte.
 * - Aucun montant n'est jamais placé dans l'URL.
 * - Un devis qui ne correspond à aucune formule payable en ligne (projet sur mesure, options ou pack
 *   réseaux sociaux) n'affiche pas de bouton de paiement : il est validé manuellement.
 */
(function () {
    var RS_NOTE = 'Ce devis comprend des options ou plusieurs prestations qui ne se paient pas en ligne : nous le validons avec vous avant tout paiement. Envoyez votre demande.';
    var APP_NOTE = 'Application web — À partir de 2 990 € : le tarif est confirmé avec vous après échange. Envoyez votre demande, aucun paiement en ligne n\'est proposé.';

    function checked(name) {
        var input = document.querySelector('input[name="' + name + '"]:checked');
        return input ? input.value : '';
    }

    // Retourne { url } ou { url: null, note } si le devis n'est pas payable en ligne.
    function getTarget() {
        var service = checked('service');
        if (!service) return { url: 'paiement.html' };
        var base = 'paiement.html?service=' + encodeURIComponent(service);

        if (service === 'web') {
            var type = checked('web-type');
            if (!type) return { url: base };
            if (type === 'app') return { url: null, note: APP_NOTE };
            var url = base + '&formula=' + encodeURIComponent('web_' + type);
            var pages = checked('web-pages');
            if (type === 'express' && pages && pages !== '1') return { url: null, note: 'Site Express comprend une seule page.' };
            if (pages && pages !== '1-5') url += '&pages=' + encodeURIComponent(pages);
            var options = [];
            document.querySelectorAll('input[name="opt-web"]:checked').forEach(function (cb) {
                if (cb.dataset.opt && options.indexOf(cb.dataset.opt) === -1) options.push(cb.dataset.opt);
            });
            if (options.length) url += '&options=' + options.map(encodeURIComponent).join(',');
            return { url: url };
        }

        if (service === 'maintenance') {
            var contrat = checked('contrat-maintenance');
            return { url: contrat ? base + '&formula=' + encodeURIComponent('maintenance_site_' + contrat) : base };
        }

        if (service === 'reseaux-sociaux') {
            var objectif = checked('objectif-rs');
            var plateforme = checked('plateforme-rs');
            var forfait = checked('forfait-rs');
            if (!objectif) return { url: base };
            var optionsRS = document.querySelectorAll('input[name="opt-rs"]:checked').length;
            if (objectif === 'pack' || optionsRS > 0) return { url: null, note: RS_NOTE };
            if (objectif === 'creation' && plateforme) return { url: base + '&formula=' + encodeURIComponent('rs_' + plateforme) };
            if (objectif === 'gestion' && forfait) return { url: base + '&formula=' + encodeURIComponent('rs_' + forfait) };
            return { url: base };
        }

        return { url: base };
    }

    function apply() {
        var target = getTarget();
        var btnPayer = document.getElementById('btn-payer');
        var altLink = document.getElementById('stripeAltLinkHref');
        var note = document.getElementById('payerNote');
        if (btnPayer) {
            btnPayer.style.display = target.url ? '' : 'none';
            if (target.url) btnPayer.setAttribute('href', target.url);
            else btnPayer.removeAttribute('href');
        }
        if (altLink) {
            if (target.url) altLink.setAttribute('href', target.url);
            else altLink.removeAttribute('href');
        }
        if (note) {
            note.textContent = target.note || '';
            note.style.display = target.note ? 'block' : 'none';
        }
        return target;
    }

    window.cxDevisPaymentTarget = getTarget;

    document.addEventListener('DOMContentLoaded', function () {
        var form = document.getElementById('devisForm');
        if (form) form.addEventListener('change', apply);
        var ttcEl = document.getElementById('totalPriceTTC');
        if (ttcEl) new MutationObserver(apply).observe(ttcEl, { childList: true, characterData: true, subtree: true });
        apply();
    });
})();
