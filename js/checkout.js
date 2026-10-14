/**
 * Lance Stripe Checkout à partir d'une clé de formule autorisée.
 * Le montant, la devise et le type de paiement sont résolus exclusivement par
 * l'API PHP : aucune donnée financière n'est fiable côté navigateur.
 */
async function startCheckout({ priceKey, webPages, webOptions }) {
  const btn = document.getElementById('btn-payer') || document.getElementById('payCheckoutBtn');
  const originalHTML = btn ? btn.innerHTML : '';
  if (startCheckout.pending) return;

  if (!priceKey || typeof priceKey !== 'string') {
    throw new Error('Formule de paiement invalide.');
  }

  startCheckout.pending = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Redirection sécurisée...';
  }

  try {
    const response = await fetch('/api/create-checkout-session.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // webPages / webOptions : simples identifiants (créations de site) ; le serveur recalcule le montant.
      body: JSON.stringify({ priceKey, webPages, webOptions }),
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.url) {
      throw new Error(data.error || 'Le paiement sécurisé est indisponible.');
    }

    window.location.assign(data.url);
  } catch (error) {
    console.error('[Checkout] Unable to start checkout:', error.message);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
    alert(error.name === 'AbortError'
      ? 'Le serveur met trop de temps à répondre. Veuillez réessayer dans quelques instants.'
      : 'Le paiement en ligne est temporairement indisponible. Veuillez nous contacter pour finaliser votre commande.');
  } finally {
    clearTimeout(timeout);
    startCheckout.pending = false;
  }
}
