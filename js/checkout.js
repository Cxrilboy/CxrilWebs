/**
 * checkout.js — Logique de paiement Stripe via Netlify Function
 * Dépend de js/pricing.js (PRICING_CONFIG)
 *
 * Endpoint : /.netlify/functions/create-checkout-session
 * Aucune clé Stripe côté client — tout est géré côté serveur.
 */

/**
 * Lance une session Stripe Checkout via la Netlify Function.
 *
 * @param {Object} params
 * @param {number} params.amount      - Montant en euros (ex. 87)
 * @param {string} params.description - Libellé affiché sur la page Stripe (ex. "Site Vitrine — Acompte CxrilWebs")
 * @param {string} params.mode        - 'payment' | 'subscription'
 */
async function startCheckout({ amount, description, mode }) {
  var btn = document.getElementById('btn-payer') || document.getElementById('payCheckoutBtn');
  var originalHTML = btn ? btn.innerHTML : '';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Redirection en cours...';
  }

  try {
    var numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount < 0.5) {
      throw new Error('Montant invalide (doit être >= 0.50 €)');
    }

    var sanitizedMode = (mode || 'payment').toLowerCase();
    if (!['payment', 'subscription'].includes(sanitizedMode)) {
      throw new Error('Mode de paiement invalide (' + mode + ')');
    }

    var response = await fetch('/.netlify/functions/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: numericAmount,
        description: description || 'Prestation CxrilWebs',
        mode: sanitizedMode,
      }),
    });

    var text = await response.text();
    var data;

    try {
      data = text ? JSON.parse(text) : {};
    } catch (parseError) {
      throw new Error('Réponse serveur invalide (JSON attendu): ' + text);
    }

    if (!response.ok) {
      var serverError = (data && data.error) ? data.error : 'Erreur HTTP ' + response.status;
      throw new Error('Erreur Stripe serveur : ' + serverError);
    }

    if (data.url && data.session_id) {
      // ── Enregistrer le paiement en BDD Supabase (asynchrone, non-bloquant) ──
      (async function() {
        try {
          if (typeof window.sbRecordPayment === 'function') {
            var email = document.querySelector('input[type="email"]')?.value || '';
            var userId = email ? await window.sbEnsureUser('Client Paiement', email, '') : null;
            await window.sbRecordPayment(null, userId, numericAmount, data.session_id, sanitizedMode, description);
            console.log('✅ Paiement enregistré en BDD');
          }
        } catch (err) {
          console.warn('⚠️ Erreur BDD paiement (non-bloquant):', err.message);
        }
      })();

      window.location.href = data.url; // Redirection vers Stripe Checkout
    } else {
      throw new Error(data.error || 'Erreur inconnue');
    }
  } catch (error) {
    console.error('[Checkout Error]', error.message);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
    alert('Le paiement en ligne est temporairement indisponible.\n\nVeuillez nous contacter par WhatsApp.\nErreur : ' + error.message);
    // Fallback WhatsApp
    var waMsg = 'Bonjour, je souhaite régler ma commande :\n• ' + description + '\n• Montant : ' + amount + '€\nPouvez-vous me confirmer les modalités de paiement ?';
    window.open('https://wa.me/590690752430?text=' + encodeURIComponent(waMsg), '_blank', 'noopener,noreferrer');
  }
}
