/**
 * Client Supabase - CxrilWebs
 * Compatible navigateur sans bundler (utilise le CDN Supabase charge dans le <head>)
 * Expose les fonctions en variables globales window.sbEnsureUser, window.sbCreateDevis, etc.
 */

console.log('[Supabase] Script supabase-client.js started');
console.log('[Supabase] typeof supabase:', typeof window.supabase);

(function() {
    'use strict';

    // -- Configuration ---------------------------------------------------------
    var SUPABASE_URL = '';
    var SUPABASE_KEY = '';

    var metaUrl = document.querySelector('meta[name="supabase-url"]');
    var metaKey = document.querySelector('meta[name="supabase-key"]');
    if (metaUrl) SUPABASE_URL = metaUrl.getAttribute('content') || '';
    if (metaKey) SUPABASE_KEY = metaKey.getAttribute('content') || '';
    
    console.log('[Supabase] Configuration loaded:', {
        urlExists: !!SUPABASE_URL,
        keyExists: !!SUPABASE_KEY,
        supabaseLibLoaded: typeof window.supabase !== 'undefined'
    });

    // -- Initialisation du client ----------------------------------------------
    var _client = null;

    function getClient() {
        if (_client) return _client;
        // Re-lire les meta tags si pas encore disponibles (mobile)
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            var mu = document.querySelector('meta[name="supabase-url"]');
            var mk = document.querySelector('meta[name="supabase-key"]');
            if (mu) SUPABASE_URL = mu.getAttribute('content') || '';
            if (mk) SUPABASE_KEY = mk.getAttribute('content') || '';
        }
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            console.error('[Supabase] Configuration incomplète : URL ou clé d\'accès manquante.');
            return null;
        }
        if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
            console.error('[Supabase] ERREUR: La librairie Supabase n\'est pas chargée! typeof supabase =', typeof window.supabase);
            return null;
        }
        try {
            _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log('[Supabase] Client initialisé avec succès');
            return _client;
        } catch(err) {
            console.error('[Supabase] Erreur création client:', err.message);
            return null;
        }
    }

    // -- Attendre que le CDN Supabase soit chargé (utile sur mobile) -----------
    function waitForClient(timeoutMs) {
        return new Promise(function(resolve) {
            var db = getClient();
            if (db) { resolve(db); return; }
            var start = Date.now();
            var interval = setInterval(function() {
                db = getClient();
                if (db) {
                    clearInterval(interval);
                    resolve(db);
                } else if (Date.now() - start > (timeoutMs || 5000)) {
                    clearInterval(interval);
                    console.warn('[Supabase] Délai d\'attente dépassé pour le chargement du client.');
                    resolve(null);
                }
            }, 200);
        });
    }

    // -- Cree ou recupere un utilisateur --------------------------------------
    async function ensureUser(nom, email, telephone) {
        var db = getClient();
        if (!db) {
            db = await waitForClient(5000);
        }
        if (!db) return null;
        try {
            var res = await db.from('users').select('id').eq('email', email.toLowerCase()).maybeSingle();
            if (res.error) {
                console.warn('[Supabase] Erreur lors de la recherche utilisateur :', res.error.message);
            }
            if (res.data) return res.data.id;

            var ins = await db.from('users').insert({
                nom: nom.trim(),
                email: email.trim().toLowerCase(),
                telephone: telephone ? telephone.trim() : null,
                rgpd_consent: true,
                consented_at: new Date().toISOString()
            }).select('id').single();

            if (ins.error) {
                if (ins.error.code === '23505') {
                    var retry = await db.from('users').select('id').eq('email', email.toLowerCase()).maybeSingle();
                    if (retry.data) return retry.data.id;
                }
                throw ins.error;
            }
            console.log('[Supabase] Utilisateur créé avec succès :', ins.data.id);
            return ins.data.id;
        } catch (err) {
            console.warn('[Supabase] Impossible de créer ou récupérer l\'utilisateur :', err.message || err);
            return null;
        }
    }

    // -- Cree un devis ---------------------------------------------------------
    async function createDevis(userId, service, montantHt, options) {
        var db = getClient();
        if (!db) {
            db = await waitForClient(5000);
        }
        if (!db) return null;
        options = options || {};
        try {
            var now = new Date();
            var exp = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            var num = 'DEV-' + now.getFullYear() + '-' + String(Math.floor(Math.random() * 900) + 100);
            var row = {
                numero: num,
                user_id: userId,
                service: service,
                statut: 'brouillon',
                montant_ht: montantHt,
                montant_ttc: null,
                message_client: options.message || null,
                valide_jusqu_au: exp.toISOString().split('T')[0]
            };

            var ins = await db.from('devis').insert(row).select().single();
            if (ins.error) throw ins.error;
            console.log('[Supabase] Devis créé avec succès :', ins.data.numero);
            return ins.data;
        } catch (err) {
            console.warn('[Supabase] Impossible de créer le devis :', err.message || err);
            return null;
        }
    }

    // -- Enregistre un paiement Stripe -----------------------------------------
    async function recordPayment(devisId, userId, montant, stripeSessionId, mode, description) {
        var db = getClient();
        if (!db) {
            db = await waitForClient(5000);
        }
        if (!db) return null;
        mode = mode || 'acompte';
        try {
            var row = {
                devis_id: devisId || null,
                user_id: userId || null,
                stripe_session_id: stripeSessionId,
                mode: mode,
                statut: 'en_attente',
                montant: montant,
                devise: 'EUR',
                description: description || ('Paiement ' + mode + ' via Stripe'),
                metadata: { timestamp: new Date().toISOString() }
            };

            var ins = await db.from('paiements').insert(row).select().single();
            if (ins.error) throw ins.error;
            console.log('[Supabase] Paiement enregistré avec succès :', stripeSessionId);
            return ins.data;
        } catch (err) {
            console.warn('[Supabase] Impossible d\'enregistrer le paiement :', err.message || err);
            return null;
        }
    }

    // -- Enregistre un message de contact --------------------------------------
    async function saveContact(nom, email, description, serviceRef) {
        console.log('[Supabase] saveContact appelé:', {nom, email, description, serviceRef});
        var db = getClient();
        if (!db) {
            console.log('[Supabase] Client non dispo, attente du CDN...');
            db = await waitForClient(10000);
        }
        if (!db) {
            console.error('[Supabase] ERREUR: Client impossible à initialiser');
            return null;
        }
        try {
            console.log('[Supabase] Client prêt, insertion en cours...');
            var row = {
                nom: nom.trim(),
                email: email.trim().toLowerCase(),
                message: description.trim(),
                service_ref: serviceRef || null,
                traite: false
            };
            console.log('[Supabase] Données à insérer:', row);

            var ins = await db.from('contacts').insert(row).select().single();
            if (ins.error) {
                console.error('[Supabase] Erreur insertion:', ins.error);
                throw ins.error;
            }
            console.log('[Supabase] Contact enregistré avec succès :', ins.data.id);
            return ins.data;
        } catch (err) {
            console.error('[Supabase] ERREUR contact:', {msg: err.message, code: err.code});
            return null;
        }
    }

    // -- Exposition globale ----------------------------------------------------
    window.sbEnsureUser    = ensureUser;
    window.sbCreateDevis   = createDevis;
    window.sbRecordPayment = recordPayment;
    window.sbSaveContact   = saveContact;
    window.sbGetClient     = getClient;

})();
