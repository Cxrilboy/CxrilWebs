/**
 * devis.js — Logique du générateur de devis CxrilWebs
 * Multi-étapes : navigation, calcul de prix en temps réel, envoi Supabase
 */

(function () {
    'use strict';

    // ============================================================
    // TABLE DE RÉFÉRENCE DES TARIFS — source of truth unique
    // ============================================================
    const TARIFS = {
        creation: {
            express: 290,
            vitrine: 890,
            ecommerce: 1690,
            application: 2990,
            pages: { '1-5': 0, '6-10': 90, '10+': 190 },
            options: {
                'seo-avance': 190, 'blog': 120, 'galerie': 90,
                'formulaire-avance': 60, 'animations': 80, 'hebergement': 60,
                'stock-avance': 120, 'fiches-avancees': 100, 'multidevise': 80,
                'seo-ecom': 190, 'avis-clients': 70,
                'bdd-avancee': 200, 'espace-membre': 150,
                'api-integration': 180, 'notifications': 100, 'export-data': 90
            }
        },
        maintenance: {
            ponctuelle: 80,
            mensuelle: 150,
            annuelle: 1490,
            options: {
                'monitoring': 20, 'sauvegardes-auto': 15,
                'maj-cms': 25, 'rapport-mensuel': 10
            },
            forfaits: {
                'modification-fonctionnalites': 120,
                'ajout-fonctionnalites': 150
            }
        },
        rs: {
            plateformes: { facebook: 120, instagram: 100, tiktok: 150, linkedin: 80 },
            forfaits: { basic: 160, plus: 320 },
            options: {
                'pub-fb-ig': 150, 'moderation-rs': 50, 'stories': 60
            }
        }
    };

    /* ── État global ──────────────────────────────────────── */
    let currentStep = 1;
    const TOTAL_STEPS = 4;

    /* ── Éléments DOM ─────────────────────────────────────── */
    const form         = document.getElementById('devisForm');
    const prevBtn      = document.getElementById('prevBtn');
    const nextBtn      = document.getElementById('nextBtn');
    const progressFill = document.getElementById('progressFill');
    const totalPriceEl = document.getElementById('totalPrice');
    const breakdownEl  = document.getElementById('priceBreakdown');

    if (!form) return;

    // ============================================================
    // RÈGLE 0 — recalculate() : fonction centrale
    // ============================================================
    function recalculate() {
        const service = getSelectedService();
        if (!service) {
            totalPriceEl.textContent = '0€';
            document.getElementById('totalPriceTTC').textContent = '0';
            breakdownEl.innerHTML = '<p class="price-placeholder">Sélectionnez un service pour voir l\'estimation</p>';
            return;
        }

        let total = 0;
        let surDevis = false;

        if (service === 'web') {
            total = getPrixCreation();
        } else if (service === 'maintenance') {
            total = getPrixMaintenance();
        } else if (service === 'reseaux-sociaux') {
            const result = getPrixRS();
            total = result.total;
            surDevis = result.surDevis;
        }

        // Mise à jour affichage prix
        const el = totalPriceEl;
        if (surDevis) {
            el.textContent = total > 0 ? total.toLocaleString('fr-FR') + '€' : '0€';
        } else {
            el.textContent = total > 0 ? total.toLocaleString('fr-FR') + '€' : '0€';
        }
        
        // Stocker le total (hidden) pour les liens de paiement
        document.getElementById('totalPriceTTC').textContent = total;

        // Mise à jour breakdown
        updateBreakdown(service, total, surDevis);

        // Mise à jour blocs paiement
        updatePaymentBlock(service);
        updateRecapNote(service);
    }

    // ============================================================
    // RÈGLE 2 — getPrixCreation()
    // ============================================================
    function getPrixCreation() {
        const type = form.querySelector('input[name="web-type"]:checked');
        if (!type) return 0;

        const typeMap = { express: 'express', vitrine: 'vitrine', ecommerce: 'ecommerce', app: 'application' };
        let total = TARIFS.creation[typeMap[type.value]] || 0;

        const pages = form.querySelector('input[name="web-pages"]:checked');
        if (pages) total += TARIFS.creation.pages[pages.value] || 0;

        // Options supplémentaires contextuelles
        form.querySelectorAll('input[name="opt-web"]:checked').forEach(cb => {
            total += parseInt(cb.dataset.price, 10) || 0;
        });

        return total;
    }

    // ============================================================
    // RÈGLE 3 — getPrixMaintenance()
    // ============================================================
    function getPrixMaintenance() {
        const contrat = form.querySelector('input[name="contrat-maintenance"]:checked');
        if (!contrat) return 0;

        let total = TARIFS.maintenance[contrat.value] || 0;

        const optsContainer = document.getElementById('opts-maintenance');
        const optsForfaitContainer = document.getElementById('opts-maintenance-forfait');

        // Options mensuelles (uniquement si contrat mensuel ou annuel)
        if (contrat.value === 'mensuelle' || contrat.value === 'annuelle') {
            if (optsContainer) {
                optsContainer.querySelectorAll('input').forEach(cb => {
                    cb.disabled = false;
                });
                optsContainer.style.opacity = '1';
                optsContainer.title = '';
            }
            form.querySelectorAll('input[name="opt-maint"]:checked').forEach(cb => {
                total += parseInt(cb.dataset.price, 10) || 0;
            });
        } else {
            // Ponctuelle : désactiver et décocher toutes les options mensuelles
            if (optsContainer) {
                optsContainer.querySelectorAll('input').forEach(cb => {
                    cb.checked = false;
                    cb.disabled = true;
                });
                optsContainer.style.opacity = '0.4';
                optsContainer.title = 'Options disponibles uniquement pour les contrats récurrents';
            }
        }

        // Forfaits ponctuels (disponibles indépendamment du type de contrat)
        if (optsForfaitContainer) {
            optsForfaitContainer.querySelectorAll('input').forEach(cb => {
                cb.disabled = false;
            });
            optsForfaitContainer.style.opacity = '1';
            optsForfaitContainer.title = '';
        }
        form.querySelectorAll('input[name="opt-maint-forfait"]:checked').forEach(cb => {
            total += parseInt(cb.dataset.price, 10) || 0;
        });

        return total;
    }

    // ============================================================
    // RÈGLE 4 — getPrixRS()
    // ============================================================
    function getPrixRS() {
        let total = 0;
        let surDevis = false;

        const objectif = (form.querySelector('input[name="objectif-rs"]:checked') || {}).value;
        const forfait = (form.querySelector('input[name="forfait-rs"]:checked') || {}).value;
        const plateforme = (form.querySelector('input[name="plateforme-rs"]:checked') || {}).value;

        // Prix création par plateforme (si objectif = création ou pack)
        if ((objectif === 'creation' || objectif === 'pack') && plateforme) {
            total += TARIFS.rs.plateformes[plateforme] || 0;
        }

        // Forfait gestion (si objectif = gestion ou pack)
        if (objectif === 'gestion' || objectif === 'pack') {
            if (forfait) total += TARIFS.rs.forfaits[forfait] || 0;
        }

        // Options supplémentaires du réseau sélectionné
        var activeOptsId = plateforme ? 'opts-rs-' + plateforme : null;
        if (activeOptsId) {
            var activeOptsEl = document.getElementById(activeOptsId);
            if (activeOptsEl) {
                activeOptsEl.querySelectorAll('input[name="opt-rs"]:checked').forEach(cb => {
                    total += parseInt(cb.dataset.price, 10) || 0;
                });
            }
        }

        return { total, surDevis };
    }

    // ============================================================
    // RÈGLE 5 — Logique de paiement (acompte vs abonnement)
    // ============================================================
    function updatePaymentBlock(service) {
        const blocAcompte    = document.getElementById('bloc-acompte');
        const blocAbonnement = document.getElementById('bloc-abonnement');

        const estAbonnement = ['maintenance', 'reseaux-sociaux'].includes(service);

        if (blocAcompte)    blocAcompte.style.display    = estAbonnement ? 'none' : (service === 'web' ? 'block' : 'none');
        if (blocAbonnement) blocAbonnement.style.display = estAbonnement ? 'block' : 'none';
    }

    function updateRecapNote(service) {
        const recapEl = document.getElementById('recap-note');
        if (!recapEl) return;

        const messages = {
            web: 'Devis indicatif. Le tarif définitif sera confirmé après analyse complète de votre projet.',
            maintenance: 'Tarif mensuel estimatif. Un audit de votre site sera réalisé avant signature du contrat.',
            'reseaux-sociaux': 'Estimation indicative. Premier mois sans engagement.'
        };

        if (messages[service]) {
            recapEl.textContent = messages[service];
            recapEl.style.display = 'block';
        } else {
            recapEl.style.display = 'none';
        }
    }

    // ============================================================
    // Breakdown / détail latéral
    // ============================================================
    function updateBreakdown(service, total, surDevis) {
        const breakdown = [];

        if (service === 'web') {
            const type = form.querySelector('input[name="web-type"]:checked');
            if (type) {
                const labels = { express: 'Site Express', vitrine: 'Site vitrine', ecommerce: 'Site e-commerce', app: 'Application web' };
                const typeMap = { express: 'express', vitrine: 'vitrine', ecommerce: 'ecommerce', app: 'application' };
                const p = TARIFS.creation[typeMap[type.value]] || 0;
                breakdown.push({ label: labels[type.value], amount: p });
            }
            const pages = form.querySelector('input[name="web-pages"]:checked');
            if (pages) {
                const p = TARIFS.creation.pages[pages.value] || 0;
                if (p > 0) breakdown.push({ label: 'Pages supplémentaires', amount: p });
            }
            form.querySelectorAll('input[name="opt-web"]:checked').forEach(cb => {
                const p = parseInt(cb.dataset.price, 10) || 0;
                const lbl = cb.closest('label').querySelector('span').childNodes[0].textContent.trim();
                breakdown.push({ label: lbl, amount: p });
            });
        }

        if (service === 'maintenance') {
            const contrat = form.querySelector('input[name="contrat-maintenance"]:checked');
            if (contrat) {
                const labels = { ponctuelle: 'Intervention ponctuelle', mensuelle: 'Contrat mensuel', annuelle: 'Contrat annuel' };
                breakdown.push({ label: labels[contrat.value], amount: TARIFS.maintenance[contrat.value] || 0 });
            }
            form.querySelectorAll('input[name="opt-maint"]:checked').forEach(cb => {
                if (cb.disabled) return;
                const p = parseInt(cb.dataset.price, 10) || 0;
                const lbl = cb.closest('label').querySelector('span').childNodes[0].textContent.trim();
                breakdown.push({ label: lbl, amount: p });
            });
            form.querySelectorAll('input[name="opt-maint-forfait"]:checked').forEach(cb => {
                if (cb.disabled) return;
                const p = parseInt(cb.dataset.price, 10) || 0;
                const lbl = cb.closest('label').querySelector('span').childNodes[0].textContent.trim();
                breakdown.push({ label: lbl, amount: p });
            });
        }

        if (service === 'reseaux-sociaux') {
            const objectif = (form.querySelector('input[name="objectif-rs"]:checked') || {}).value;
            const plateforme = (form.querySelector('input[name="plateforme-rs"]:checked') || {}).value;
            if ((objectif === 'creation' || objectif === 'pack') && plateforme) {
                const p = TARIFS.rs.plateformes[plateforme] || 0;
                const name = plateforme.charAt(0).toUpperCase() + plateforme.slice(1);
                breakdown.push({ label: name + ' (création)', amount: p });
            }
            const forfait = (form.querySelector('input[name="forfait-rs"]:checked') || {}).value;
            if ((objectif === 'gestion' || objectif === 'pack') && forfait) {
                const fLabels = { basic: 'Forfait Basic (4 posts/mois)', plus: 'Forfait Plus (8 posts/mois)' };
                breakdown.push({ label: fLabels[forfait], amount: TARIFS.rs.forfaits[forfait] || 0 });
            }
            var activeOptsId = plateforme ? 'opts-rs-' + plateforme : null;
            if (activeOptsId) {
                var activeOptsEl = document.getElementById(activeOptsId);
                if (activeOptsEl) {
                    activeOptsEl.querySelectorAll('input[name="opt-rs"]:checked').forEach(cb => {
                        const p = parseInt(cb.dataset.price, 10) || 0;
                        const lbl = cb.closest('label').querySelector('span').childNodes[0].textContent.trim();
                        breakdown.push({ label: lbl, amount: p });
                    });
                }
            }
        }

        breakdownEl.innerHTML = '';
        if (breakdown.length === 0) {
            breakdownEl.innerHTML = '<p class="price-placeholder">Complétez les options pour affiner l\'estimation</p>';
        } else {
            breakdown.forEach(item => {
                const div = document.createElement('div');
                div.className = 'breakdown-item';
                div.innerHTML = '<span class="b-label">' + escapeHTML(item.label) + '</span><span class="b-amount">' + item.amount.toLocaleString('fr-FR') + '€</span>';
                breakdownEl.appendChild(div);
            });
        }
    }

    // ============================================================
    // RÈGLE 1 — Affichage des cartes inclus
    // ============================================================

    // Création — carte selon type de site
    function showInclusCreation() {
        ['inclus-express', 'inclus-vitrine', 'inclus-ecom', 'inclus-app'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const type = (form.querySelector('input[name="web-type"]:checked') || {}).value;
        const map = { express: 'inclus-express', vitrine: 'inclus-vitrine', ecommerce: 'inclus-ecom', app: 'inclus-app' };
        const target = map[type];
        if (target) {
            const el = document.getElementById(target);
            if (el) el.style.display = 'block';
        }
    }

    // Création — options contextuelles
    function showOptsCreation() {
        ['opts-express', 'opts-vitrine', 'opts-ecom', 'opts-app'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = 'none';
                el.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
            }
        });
        const type = (form.querySelector('input[name="web-type"]:checked') || {}).value;
        const map = { express: 'opts-express', vitrine: 'opts-vitrine', ecommerce: 'opts-ecom', app: 'opts-app' };
        const target = map[type];
        if (target) {
            const el = document.getElementById(target);
            if (el) el.style.display = 'block';
        }
    }

    // Maintenance — carte selon contrat
    function showInclusMaintenance() {
        ['inclus-ponctuelle', 'inclus-mensuelle', 'inclus-annuelle'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const contrat = (form.querySelector('input[name="contrat-maintenance"]:checked') || {}).value;
        if (contrat) {
            const el = document.getElementById('inclus-' + contrat);
            if (el) el.style.display = 'block';
        }
    }

    // RS — carte selon forfait
    function showInclusRS() {
        const basic = document.getElementById('inclus-basic');
        const plus  = document.getElementById('inclus-plus');
        const forfait = (form.querySelector('input[name="forfait-rs"]:checked') || {}).value;
        if (basic) basic.style.display = forfait === 'basic' ? 'block' : 'none';
        if (plus)  plus.style.display  = forfait === 'plus'  ? 'block' : 'none';
    }

    // RS — affichage conditionnel objectif / forfait / options par réseau
    function updateRSFlow() {
        const plateforme = (form.querySelector('input[name="plateforme-rs"]:checked') || {}).value;
        const objectifGroup  = document.getElementById('rs-group-objectif');
        const forfaitBloc    = document.getElementById('bloc-forfait-rs');
        const msgTiktok      = document.getElementById('msg-tiktok');

        // TikTok message
        if (msgTiktok) msgTiktok.style.display = (plateforme === 'tiktok') ? 'block' : 'none';

        // Objectif visible si une plateforme sélectionnée
        if (objectifGroup) objectifGroup.style.display = plateforme ? 'block' : 'none';

        const objectif = (form.querySelector('input[name="objectif-rs"]:checked') || {}).value;
        const showForfait = objectif === 'gestion' || objectif === 'pack';

        if (forfaitBloc) forfaitBloc.style.display = showForfait ? 'block' : 'none';

        // Options par réseau — afficher uniquement celles du réseau sélectionné
        ['facebook', 'instagram', 'tiktok', 'linkedin'].forEach(function(net) {
            var optsEl = document.getElementById('opts-rs-' + net);
            if (optsEl) {
                var shouldShow = showForfait && (net === plateforme);
                if (!shouldShow) {
                    // Décocher les options masquées
                    optsEl.querySelectorAll('input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
                }
                optsEl.style.display = shouldShow ? 'block' : 'none';
            }
        });

        if (!showForfait) {
            form.querySelectorAll('input[name="forfait-rs"]').forEach(r => { r.checked = false; });
            var basic = document.getElementById('inclus-basic');
            var plus  = document.getElementById('inclus-plus');
            if (basic) basic.style.display = 'none';
            if (plus)  plus.style.display  = 'none';
        }
    }

    // ============================================================
    // RÈGLE 7 — Réinitialisation au changement de service
    // ============================================================
    function resetAllOptions() {
        // Décocher toutes les options de tous les services
        form.querySelectorAll('.options-group input[type="checkbox"], input[name="opt-web"], input[name="opt-maint"], input[name="opt-maint-forfait"], input[name="opt-rs"]').forEach(cb => { cb.checked = false; });
        form.querySelectorAll('input[name="contrat-maintenance"]').forEach(r => { r.checked = false; });
        form.querySelectorAll('input[name="forfait-rs"]').forEach(r => { r.checked = false; });
        form.querySelectorAll('input[name="objectif-rs"]').forEach(r => { r.checked = false; });
        form.querySelectorAll('input[name="plateforme-rs"]').forEach(cb => { cb.checked = false; });
        form.querySelectorAll('input[name="opt-rs"]').forEach(cb => { cb.checked = false; });
        form.querySelectorAll('input[name="web-type"]').forEach(r => { r.checked = false; });
        form.querySelectorAll('input[name="web-pages"]').forEach(r => { r.checked = false; });

        // Masquer toutes les cartes inclus et options contextuelles
        form.querySelectorAll('.inclus-card').forEach(c => { c.style.display = 'none'; });
        form.querySelectorAll('.options-group').forEach(g => { g.style.display = 'none'; });

        var blocForfait = document.getElementById('bloc-forfait-rs');
        var optsRS      = document.getElementById('opts-rs');
        var msgTiktok   = document.getElementById('msg-tiktok');
        var objGroup    = document.getElementById('rs-group-objectif');
        if (blocForfait) blocForfait.style.display = 'none';
        if (optsRS)      optsRS.style.display      = 'none';
        if (msgTiktok)   msgTiktok.style.display   = 'none';
        if (objGroup)    objGroup.style.display     = 'none';

        // Réactiver les options maintenance si elles étaient désactivées
        var optsMaint = document.getElementById('opts-maintenance');
        if (optsMaint) {
            optsMaint.querySelectorAll('input').forEach(cb => { cb.disabled = false; });
            optsMaint.style.opacity = '1';
            optsMaint.title = '';
        }

        recalculate();
    }

    /* ── Initialisation ───────────────────────────────────── */
    function init() {
        prevBtn.addEventListener('click', prevStep);
        nextBtn.addEventListener('click', handleNext);
        form.addEventListener('submit', handleSubmit);

        // Service principal
        document.querySelectorAll('input[name="service"]').forEach(radio =>
            radio.addEventListener('change', () => {
                resetAllOptions();
                showOptionsPanel(radio.value);
                recalculate();
            })
        );

        // Création — type de site
        form.addEventListener('change', function(e) {
            if (e.target.name === 'web-type') {
                showInclusCreation();
                showOptsCreation();
                recalculate();
            }
            if (e.target.name === 'web-pages' || e.target.name === 'opt-web') {
                recalculate();
            }
        });

        // Maintenance — contrat
        form.addEventListener('change', function(e) {
            if (e.target.name === 'contrat-maintenance') {
                showInclusMaintenance();
                recalculate();
            }
            if (e.target.name === 'opt-maint' || e.target.name === 'opt-maint-forfait') {
                recalculate();
            }
        });

        // Réseaux sociaux — plateformes, objectif, forfait, options
        form.addEventListener('change', function(e) {
            if (e.target.name === 'plateforme-rs') {
                // Reset objectif, forfait et options quand on change de réseau
                form.querySelectorAll('input[name="objectif-rs"]').forEach(r => { r.checked = false; });
                form.querySelectorAll('input[name="forfait-rs"]').forEach(r => { r.checked = false; });
                form.querySelectorAll('input[name="opt-rs"]').forEach(cb => { cb.checked = false; });
                var basicEl = document.getElementById('inclus-basic');
                var plusEl  = document.getElementById('inclus-plus');
                if (basicEl) basicEl.style.display = 'none';
                if (plusEl)  plusEl.style.display  = 'none';
                updateRSFlow();
                recalculate();
            }
            if (e.target.name === 'objectif-rs') {
                updateRSFlow();
                recalculate();
            }
            if (e.target.name === 'forfait-rs') {
                showInclusRS();
                recalculate();
            }
            if (e.target.name === 'opt-rs') {
                recalculate();
            }
        });

        updateStepUI();
    }

    /* ── Navigation ───────────────────────────────────────── */
    function handleNext() {
        if (!validateStep(currentStep)) return;
        if (currentStep === 3) {
            buildRecap();
            updateStripeBlock();
        }
        currentStep = Math.min(currentStep + 1, TOTAL_STEPS);
        updateStepUI();
    }

    function prevStep() {
        currentStep = Math.max(currentStep - 1, 1);
        updateStepUI();
    }

    function updateStepUI() {
        document.querySelectorAll('.devis-step').forEach((step, idx) => {
            step.classList.toggle('active', idx + 1 === currentStep);
        });

        document.querySelectorAll('.progress-step').forEach((el, idx) => {
            const n = idx + 1;
            el.classList.remove('active', 'completed');
            if (n === currentStep) el.classList.add('active');
            if (n < currentStep)  el.classList.add('completed');
        });

        document.querySelectorAll('.progress-line').forEach((line, idx) => {
            line.classList.toggle('done', idx + 1 < currentStep);
        });

        progressFill.style.width = ((currentStep - 1) / (TOTAL_STEPS - 1) * 100) + '%';
        prevBtn.style.display = currentStep > 1 ? 'flex' : 'none';

        if (currentStep === TOTAL_STEPS) {
            nextBtn.style.display = 'none';
        } else {
            nextBtn.style.display = 'flex';
            let buttonText = 'Suivant';
            if (currentStep === 3) {
                buttonText = 'Voir le récapitulatif';
            }
            nextBtn.querySelector('span').textContent = buttonText;
        }

        const wrapper = document.querySelector('.devis-form-wrapper');
        if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* ── Validation ───────────────────────────────────────── */
    function validateStep(step) {
        clearErrors();
        if (step === 1) {
            if (!form.querySelector('input[name="service"]:checked')) {
                document.getElementById('error-step1').textContent = 'Veuillez sélectionner un service.';
                return false;
            }
        }
        if (step === 2) return validateOptions(getSelectedService());
        if (step === 3) return validateContactFields();
        return true;
    }

    function validateOptions(svc) {
        const errorEl = document.getElementById('error-step2');
        if (svc === 'web') {
            if (!form.querySelector('input[name="web-type"]:checked'))  { errorEl.textContent = 'Choisissez un type de site.'; return false; }
            if (!form.querySelector('input[name="web-pages"]:checked')) { errorEl.textContent = 'Indiquez le nombre de pages.'; return false; }
        }
        if (svc === 'maintenance') {
            if (!form.querySelector('input[name="contrat-maintenance"]:checked')) { errorEl.textContent = 'Choisissez un type de contrat.'; return false; }
        }
        if (svc === 'reseaux-sociaux') {
            if (!form.querySelector('input[name="plateforme-rs"]:checked')) { errorEl.textContent = 'Veuillez sélectionner un réseau social.'; return false; }
            if (!form.querySelector('input[name="objectif-rs"]:checked')) { errorEl.textContent = 'Veuillez choisir un objectif.'; return false; }
        }
        return true;
    }

    function validateContactFields() {
        let valid = true;
        const nom = document.getElementById('d-nom');
        if (!nom.value.trim()) {
            document.getElementById('err-nom').textContent = 'Le nom est requis.';
            nom.classList.add('error'); valid = false;
        }
        const email = document.getElementById('d-email');
        if (!email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
            document.getElementById('err-email').textContent = 'Adresse email invalide.';
            email.classList.add('error'); valid = false;
        }
        if (!document.getElementById('d-rgpd').checked) {
            document.getElementById('err-rgpd').textContent = 'Vous devez accepter la politique de confidentialité.';
            valid = false;
        }
        return valid;
    }

    function clearErrors() {
        document.querySelectorAll('.field-error, .step-error').forEach(el => el.textContent = '');
        document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    }

    /* ── Helpers ──────────────────────────────────────────── */
    function getSelectedService() {
        return (form.querySelector('input[name="service"]:checked') || {}).value || null;
    }

    /* ── Affichage du panel d'options ─────────────────────── */
    function showOptionsPanel(svc) {
        ['web', 'maintenance', 'reseaux-sociaux'].forEach(s => {
            const el = document.getElementById('options-' + s);
            if (el) el.style.display = s === svc ? 'block' : 'none';
        });
    }

    /* ── Récapitulatif / Facture ──────────────────────────── */
    function buildRecap() {
        const svc  = getSelectedService();
        const nom  = document.getElementById('d-nom').value.trim();
        const email= document.getElementById('d-email').value.trim();
        const tel  = document.getElementById('d-tel').value.trim();
        const msg  = document.getElementById('d-message').value.trim();

        const now      = new Date();
        const devisNum = 'DEV-' + now.getFullYear() + '-' + String(Math.floor(Math.random() * 900) + 100);
        const dateStr  = now.toLocaleDateString('fr-FR');
        const validite = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR');

        const lineItems = buildLineItems(svc);
        const subtotal  = lineItems.reduce((s, i) => s + i.total, 0);
        const isAbonnement = svc === 'maintenance' || svc === 'reseaux-sociaux';
        const acompte30    = !isAbonnement ? Math.round(subtotal * 0.3) : 0;
        const solde70      = subtotal - acompte30;

        document.getElementById('recapContent').innerHTML =
            '<div class="invoice-header">' +
                '<div class="invoice-company">' +
                    '<div class="invoice-logo"><span class="logo-blue">Cxril</span><span class="logo-orange">Webs.</span></div>' +
                    '<p class="invoice-tagline">SOLUTIONS IT</p>' +
                    '<div class="invoice-company-info">' +
                        '<p><i class="fas fa-map-marker-alt"></i> Chemin de Pierrette, Lamentin 97129</p>' +
                        '<p><i class="fas fa-phone"></i> +590 690 75 24 30</p>' +
                        '<p><i class="fas fa-envelope"></i> cxribanks@gmail.com</p>' +
                    '</div>' +
                '</div>' +
                '<div class="invoice-meta">' +
                    '<h1 class="invoice-title">DEVIS</h1>' +
                    '<div class="invoice-meta-details">' +
                        '<p><strong>N°</strong> ' + escapeHTML(devisNum) + '</p>' +
                        '<p><strong>Date :</strong> ' + escapeHTML(dateStr) + '</p>' +
                        '<p><strong>Validité :</strong> ' + escapeHTML(validite) + '</p>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="invoice-client">' +
                '<h3 class="invoice-client-title">DESTINATAIRE</h3>' +
                '<p class="invoice-client-name">' + escapeHTML(nom) + '</p>' +
                (tel ? '<p><i class="fas fa-phone"></i> ' + escapeHTML(tel) + '</p>' : '') +
                '<p><i class="fas fa-envelope"></i> ' + escapeHTML(email) + '</p>' +
            '</div>' +
            '<table class="invoice-table">' +
                '<thead><tr>' +
                    '<th class="col-desc">Description</th>' +
                    '<th class="col-qty">QTÉ</th>' +
                    '<th class="col-price">P.U</th>' +
                    '<th class="col-total">TOTAL</th>' +
                '</tr></thead>' +
                '<tbody>' +
                    lineItems.map(function(item) {
                        return '<tr>' +
                            '<td class="col-desc"><strong>' + escapeHTML(item.label) + '</strong>' + (item.detail ? '<br><span class="item-detail">' + escapeHTML(item.detail) + '</span>' : '') + '</td>' +
                            '<td class="col-qty">' + item.qty + '</td>' +
                            '<td class="col-price">' + item.unitPrice.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €</td>' +
                            '<td class="col-total">' + item.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €</td>' +
                        '</tr>';
                    }).join('') +
                '</tbody>' +
            '</table>' +
            '<div class="invoice-totals"><div class="invoice-totals-inner">' +
                '<div class="total-line total-final"><span>TOTAL</span><span class="total-amount">' + subtotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €</span></div>' +
                '<p class="mention-tva">TVA non applicable — art. 293 B du CGI</p>' +
                '<p class="net-a-payer">Net à payer</p>' +
            '</div></div>' +
            (msg ? '<div class="invoice-message"><h4><i class="fas fa-comment-alt"></i> Message</h4><p>' + escapeHTML(msg) + '</p></div>' : '') +
            '<div class="invoice-footer">' +
                '<div class="invoice-conditions">' +
                    '<h4>Conditions & Modalités</h4>' +
                    '<ul>' +
                        '<li>Devis valable 30 jours à compter de la date d\'émission</li>' +
                        (isAbonnement
                            ? '<li>Paiement par abonnement — premier paiement à la signature du contrat</li>'
                            : '<li>Acompte de 30% à la signature</li><li>Solde à la livraison du projet</li>') +
                        '<li>Ce devis est une estimation indicative</li>' +
                    '</ul>' +
                '</div>' +
                '<div class="invoice-partners">' +
                    '<h4>PARTENAIRES IT DE CONFIANCE</h4>' +
                    '<div class="invoice-partner-logos">' +
                        '<span><i class="fab fa-github"></i> GitHub</span>' +
                        '<span><i class="fab fa-stripe"></i> Stripe</span>' +
                        '<span><i class="fab fa-figma"></i> Figma</span>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.getElementById('printZone').innerHTML = document.getElementById('recapContent').innerHTML;
    }

    /* ── Lignes de devis ──────────────────────────────────── */
    function buildLineItems(svc) {
        var items = [];

        if (svc === 'web') {
            var type = form.querySelector('input[name="web-type"]:checked');
            if (type) {
                var labels = { express: 'Site Express', vitrine: 'Site vitrine', ecommerce: 'Site e-commerce', app: 'Application web' };
                var typeMap = { express: 'express', vitrine: 'vitrine', ecommerce: 'ecommerce', app: 'application' };
                var price = TARIFS.creation[typeMap[type.value]] || 0;
                items.push({ label: labels[type.value] || type.value, detail: 'Conception et développement sur mesure', qty: 1, unitPrice: price, total: price });
            }
            var pages = form.querySelector('input[name="web-pages"]:checked');
            if (pages && (TARIFS.creation.pages[pages.value] || 0) > 0) {
                var pAge = TARIFS.creation.pages[pages.value];
                items.push({ label: 'Pages supplémentaires', detail: pages.value, qty: 1, unitPrice: pAge, total: pAge });
            }
            form.querySelectorAll('input[name="opt-web"]:checked').forEach(function(cb) {
                var p = parseInt(cb.dataset.price, 10) || 0;
                var lbl = cb.closest('label').querySelector('span').childNodes[0].textContent.trim();
                items.push({ label: lbl, detail: '', qty: 1, unitPrice: p, total: p });
            });
        }

        if (svc === 'maintenance') {
            var contrat = form.querySelector('input[name="contrat-maintenance"]:checked');
            if (contrat) {
                var cLabels = { ponctuelle: 'Maintenance ponctuelle', mensuelle: 'Contrat mensuel', annuelle: 'Contrat annuel' };
                var cPrice = TARIFS.maintenance[contrat.value] || 0;
                items.push({ label: cLabels[contrat.value] || contrat.value, detail: 'Support technique & maintenance site web', qty: 1, unitPrice: cPrice, total: cPrice });
            }
            form.querySelectorAll('input[name="opt-maint"]:checked').forEach(function(cb) {
                if (cb.disabled) return;
                var p = parseInt(cb.dataset.price, 10) || 0;
                var lbl = cb.closest('label').querySelector('span').childNodes[0].textContent.trim();
                items.push({ label: lbl, detail: 'Option mensuelle', qty: 1, unitPrice: p, total: p });
            });
            form.querySelectorAll('input[name="opt-maint-forfait"]:checked').forEach(function(cb) {
                if (cb.disabled) return;
                var p = parseInt(cb.dataset.price, 10) || 0;
                var lbl = cb.closest('label').querySelector('span').childNodes[0].textContent.trim();
                items.push({ label: lbl, detail: 'Service ponctuel', qty: 1, unitPrice: p, total: p });
            });
        }

        if (svc === 'reseaux-sociaux') {
            var objectif = (form.querySelector('input[name="objectif-rs"]:checked') || {}).value;
            var objLabels = { creation: 'Création de présence en ligne', gestion: 'Gestion de publications', pack: 'Pack Création + Gestion' };
            if (objectif) items.push({ label: objLabels[objectif] || objectif, detail: 'Service Réseaux Sociaux', qty: 1, unitPrice: 0, total: 0 });

            var plateforme = (form.querySelector('input[name="plateforme-rs"]:checked') || {}).value;
            if ((objectif === 'creation' || objectif === 'pack') && plateforme) {
                var name = plateforme.charAt(0).toUpperCase() + plateforme.slice(1);
                var p = TARIFS.rs.plateformes[plateforme] || 0;
                items.push({ label: 'Création page ' + name, detail: 'Page / compte professionnel', qty: 1, unitPrice: p, total: p });
            }

            var forfait = (form.querySelector('input[name="forfait-rs"]:checked') || {}).value;
            if ((objectif === 'gestion' || objectif === 'pack') && forfait) {
                var fLabels = { basic: 'Forfait Basic (4 posts/mois)', plus: 'Forfait Plus (8 posts/mois)' };
                var fPrice  = TARIFS.rs.forfaits[forfait] || 0;
                items.push({ label: fLabels[forfait], detail: 'Abonnement mensuel', qty: 1, unitPrice: fPrice, total: fPrice });
            }

            var activeOptsId = plateforme ? 'opts-rs-' + plateforme : null;
            if (activeOptsId) {
                var activeOptsEl = document.getElementById(activeOptsId);
                if (activeOptsEl) {
                    activeOptsEl.querySelectorAll('input[name="opt-rs"]:checked').forEach(function(cb) {
                        var op = parseInt(cb.dataset.price, 10) || 0;
                        var lbl = cb.closest('label').querySelector('span').childNodes[0].textContent.trim();
                        items.push({ label: lbl, detail: 'Option mensuelle', qty: 1, unitPrice: op, total: op });
                    });
                }
            }
        }

        return items;
    }

    /* ── Collecte options texte pour le devis ─────────────── */
    function collectSelectedOptionsText(svc) {
        var results = [];
        if (svc === 'web') {
            form.querySelectorAll('input[name="opt-web"]:checked').forEach(function(cb) {
                var lbl = cb.closest('label').querySelector('span').childNodes[0].textContent.trim();
                results.push(lbl);
            });
            var wt = form.querySelector('input[name="web-type"]:checked');
            if (wt) results.push('Type: ' + wt.value);
            var wp = form.querySelector('input[name="web-pages"]:checked');
            if (wp) results.push('Pages: ' + wp.value);
        } else if (svc === 'maintenance') {
            var ct = form.querySelector('input[name="contrat-maintenance"]:checked');
            if (ct) results.push('Contrat: ' + ct.value);
            form.querySelectorAll('input[name="opt-maint"]:checked').forEach(function(cb) {
                if (!cb.disabled) {
                    var lbl = cb.closest('label').querySelector('span').childNodes[0].textContent.trim();
                    results.push(lbl);
                }
            });
            form.querySelectorAll('input[name="opt-maint-forfait"]:checked').forEach(function(cb) {
                if (!cb.disabled) {
                    var lbl = cb.closest('label').querySelector('span').childNodes[0].textContent.trim();
                    results.push(lbl);
                }
            });
        } else if (svc === 'reseaux-sociaux') {
            var obj = form.querySelector('input[name="objectif-rs"]:checked');
            if (obj) results.push('Objectif: ' + obj.value);
            form.querySelectorAll('input[name="plateforme-rs"]:checked').forEach(function(cb) {
                results.push('Plateforme: ' + cb.value);
            });
            var ff = form.querySelector('input[name="forfait-rs"]:checked');
            if (ff) results.push('Forfait: ' + ff.value);
            form.querySelectorAll('input[name="opt-rs"]:checked').forEach(function(cb) {
                var lbl = cb.closest('label').querySelector('span').childNodes[0].textContent.trim();
                results.push(lbl);
            });
        }
        return results;
    }

    function computeTotal(svc) {
        if (svc === 'web') return getPrixCreation();
        if (svc === 'maintenance') return getPrixMaintenance();
        if (svc === 'reseaux-sociaux') return getPrixRS().total;
        return 0;
    }

    /* ── Envoi Supabase ───────────────────────────────────── */
    async function handleSubmit(e) {
        e.preventDefault();
        if (!validateContactFields()) return;

        const submitBtn = document.getElementById('devisSubmitBtn');
        const btnText   = submitBtn.querySelector('.btn-text');
        const btnLoader = submitBtn.querySelector('.btn-loader');
        const successEl = document.getElementById('devisSuccess');

        submitBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline';

        const svc  = getSelectedService();
        const nom  = document.getElementById('d-nom').value.trim();
        const eml  = document.getElementById('d-email').value.trim();
        const tel  = document.getElementById('d-tel').value.trim();
        const msg  = document.getElementById('d-message').value.trim();
        const total = computeTotal(svc);

        try {
            if (typeof window.sbEnsureUser !== 'function') {
                throw new Error('Client Supabase non initialisé — vérifie les meta tags supabase-url / supabase-key dans le <head>.');
            }
            const userId = await window.sbEnsureUser(nom, eml, tel);
            const devis  = await window.sbCreateDevis(userId, svc, total, {
                message: msg,
                options: collectSelectedOptionsText(svc).join(', ')
            });
            if (!devis) throw new Error('createDevis a retourné null — vérifie la connexion Supabase.');

            successEl.className = 'devis-success show success';
            successEl.innerHTML = '<i class="fas fa-check-circle"></i> Votre demande a bien été envoyée ! Nous vous répondrons sous 24h.';
            form.reset();
        } catch (err) {
            console.error('[Devis] Erreur envoi:', err.message);
            successEl.className = 'devis-success show error';
            successEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Une erreur est survenue. Veuillez réessayer ou nous contacter directement.';
        } finally {
            submitBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
        }
    }

    /* ── Stripe ───────────────────────────────────────────── */
    function updateStripeBlock() {
        const total   = computeTotal(getSelectedService());
        const ttcText = document.getElementById('totalPriceTTC').textContent;
        const ttc     = parseFloat(ttcText) || 0;
        const service = getSelectedService();
        const block             = document.getElementById('stripePaymentBlock');
        const subscriptionBlock = document.getElementById('stripeSubscriptionBlock');
        const payBtn            = document.getElementById('stripePayBtn');

        if (!block) return;
        if (!total || !service) { block.style.display = 'none'; return; }

        block.style.display = 'block';
        block.classList.remove('stripe-fadeIn');
        void block.offsetWidth;
        block.classList.add('stripe-fadeIn');

        const isAbonnement = service === 'maintenance' || service === 'reseaux-sociaux';

        if (isAbonnement) {
            document.querySelector('.stripe-payment-amounts').style.display = 'none';
            payBtn.style.display = 'none';
            if (subscriptionBlock) subscriptionBlock.style.display = 'block';

            var subscribeBtn = document.getElementById('stripeSubscribeBtn');
            if (service === 'maintenance') {
                var contrat = (form.querySelector('input[name="contrat-maintenance"]:checked') || {}).value || 'mensuelle';
                if (subscribeBtn) subscribeBtn.href = 'paiement.html?service=maintenance&formula=site_' + contrat + '&mode=' + (contrat === 'annuelle' ? 'payment' : 'subscription');
            } else {
                if (subscribeBtn) subscribeBtn.href = 'paiement.html?service=reseaux-sociaux';
            }
            return;
        }

        // Création de site — acompte 30%
        if (subscriptionBlock) subscriptionBlock.style.display = 'none';
        payBtn.style.display = 'flex';
        document.querySelector('.stripe-payment-amounts').style.display = 'flex';

        const acompte = Math.round(ttc * 0.30);
        const solde   = Math.round(ttc * 0.70);
        document.getElementById('stripeAcompteLabel').textContent = 'Acompte 30% dû maintenant';
        document.getElementById('stripeAcompteValue').textContent = acompte.toLocaleString('fr-FR') + ' €';
        document.getElementById('stripeSoldeLabel').textContent   = 'Solde 70% à la livraison';
        document.getElementById('stripeSoldeValue').textContent   = solde.toLocaleString('fr-FR') + ' €';
        document.getElementById('stripePayBtnText').textContent   = 'Payer l\'acompte de ' + acompte.toLocaleString('fr-FR') + ' €';

        payBtn.removeEventListener('click', initiateCheckout);
        payBtn.addEventListener('click', initiateCheckout);
    }

    async function initiateCheckout(e) {
        e.preventDefault();
        const service = getSelectedService();
        const total   = computeTotal(service);
        const ttcText = document.getElementById('totalPriceTTC').textContent;
        const ttc     = parseFloat(ttcText) || 0;
        if (!service || !ttc) return;

        const btn     = document.getElementById('stripePayBtn');
        const origHTML= btn.innerHTML;
        const acompte = Math.round(ttc * 0.30);

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Redirection sécurisée...';
        btn.disabled  = true;

        try {
            const res = await fetch('/.netlify/functions/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: acompte, description: 'Devis ' + service + ' — Acompte CxrilWebs', mode: 'payment', currency: 'eur' }),
            });
            const text = await res.text();
            var data;
            try { data = text ? JSON.parse(text) : {}; }
            catch (parseErr) { throw new Error('Réponse serveur invalide : ' + text.substring(0, 200)); }
            if (!res.ok) {
                var serverError = (data && data.error) ? data.error : 'Erreur HTTP ' + res.status;
                throw new Error('Erreur Stripe : ' + serverError);
            }
            if (data.url) window.location.href = data.url;
            else throw new Error(data.error || 'Pas d\'URL de paiement reçue');
        } catch (err) {
            console.error('Erreur Stripe:', err);
            alert('Erreur lors de la redirection. Veuillez réessayer.');
            btn.innerHTML = origHTML;
            btn.disabled  = false;
        }
    }

    /* ── XSS escape ───────────────────────────────────────── */
    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    init();

    // ════════════════════════════════════════════════════════════════
    // EVENT LISTENER — Bouton "Procéder au paiement"
    // ════════════════════════════════════════════════════════════════
    const btnPayer = document.getElementById('btn-payer');
    if (btnPayer) {
        // Override du href par un event listener qui construit les paramètres correctement
        btnPayer.addEventListener('click', function(e) {
            const service = getSelectedService();
            if (!service) return; // Pas de service sélectionné, laisser le href par défaut
            
            const total = computeTotal(service);
            const contrat = form.querySelector('input[name="contrat-maintenance"]:checked');
            const webType = form.querySelector('input[name="web-type"]:checked');
            
            // Construire les paramètres query
            let url = 'paiement.html?service=' + encodeURIComponent(service);
            url += '&total=' + encodeURIComponent(total);
            
            // Ajouter des paramètres contextuels selon le service
            if (service === 'web' && webType) {
                url += '&type=' + encodeURIComponent(webType.value);
            } else if (service === 'maintenance' && contrat) {
                url += '&contrat=' + encodeURIComponent(contrat.value);
            }
            
            // Naviguer vers la page de paiement
            window.location.href = url;
        });
    }

})();