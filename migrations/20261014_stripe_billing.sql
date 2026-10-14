-- À appliquer d'abord en préproduction, puis avant le nouveau webhook en production.
-- Migration additive : aucun changement aux paiements/devis historiques.
BEGIN;

CREATE TABLE IF NOT EXISTS public.stripe_billing_events (
    livemode boolean NOT NULL,
    stripe_event_id text NOT NULL,
    event_type text NOT NULL,
    stripe_subscription_id text NOT NULL,
    stripe_invoice_id text,
    processed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (livemode, stripe_event_id)
);
CREATE TABLE IF NOT EXISTS public.stripe_billing_locks (
    livemode boolean NOT NULL,
    stripe_subscription_id text NOT NULL,
    token text NOT NULL,
    lease_until timestamptz NOT NULL,
    PRIMARY KEY (livemode, stripe_subscription_id)
);
CREATE TABLE IF NOT EXISTS public.stripe_subscriptions (
    livemode boolean NOT NULL,
    stripe_subscription_id text NOT NULL,
    stripe_customer_id text NOT NULL,
    status text NOT NULL,
    cancel_at_period_end boolean NOT NULL,
    state jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (livemode, stripe_subscription_id)
);
CREATE TABLE IF NOT EXISTS public.stripe_subscription_invoices (
    livemode boolean NOT NULL,
    stripe_invoice_id text NOT NULL,
    stripe_subscription_id text NOT NULL,
    status text NOT NULL,
    amount_due_cents bigint NOT NULL,
    amount_paid_cents bigint NOT NULL,
    currency text NOT NULL,
    state jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (livemode, stripe_invoice_id)
);
CREATE INDEX IF NOT EXISTS stripe_subscription_invoices_subscription_idx
    ON public.stripe_subscription_invoices (livemode, stripe_subscription_id);

ALTER TABLE public.stripe_billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_billing_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_subscription_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_billing_events, public.stripe_billing_locks,
    public.stripe_subscriptions, public.stripe_subscription_invoices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_billing_events, public.stripe_billing_locks,
    public.stripe_subscriptions, public.stripe_subscription_invoices TO service_role;

CREATE OR REPLACE FUNCTION public.cx_claim_stripe_billing(
    p_event_id text, p_livemode boolean, p_subscription_id text, p_token text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.stripe_billing_events
        WHERE livemode = p_livemode AND stripe_event_id = p_event_id) THEN
        RETURN jsonb_build_object('state', 'duplicate');
    END IF;
    INSERT INTO public.stripe_billing_locks AS current_lock
        (livemode, stripe_subscription_id, token, lease_until)
    VALUES (p_livemode, p_subscription_id, p_token, clock_timestamp() + interval '90 seconds')
    ON CONFLICT (livemode, stripe_subscription_id) DO UPDATE
        SET token = EXCLUDED.token, lease_until = EXCLUDED.lease_until
        WHERE current_lock.lease_until <= clock_timestamp();
    IF NOT FOUND THEN RETURN jsonb_build_object('state', 'busy'); END IF;
    RETURN jsonb_build_object('state', 'claimed');
END;
$$;

CREATE OR REPLACE FUNCTION public.cx_apply_stripe_billing(
    p_event_id text, p_event_type text, p_livemode boolean,
    p_subscription_id text, p_token text, p_subscription jsonb, p_invoice jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM 1 FROM public.stripe_billing_locks
        WHERE livemode = p_livemode AND stripe_subscription_id = p_subscription_id
          AND token = p_token AND lease_until > clock_timestamp() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Billing lease expired or replaced'; END IF;
    IF p_subscription->>'id' IS DISTINCT FROM p_subscription_id
        OR (p_invoice IS NOT NULL AND p_invoice->>'subscription_id' IS DISTINCT FROM p_subscription_id) THEN
        RAISE EXCEPTION 'Mismatched subscription';
    END IF;
    INSERT INTO public.stripe_billing_events (livemode, stripe_event_id, event_type, stripe_subscription_id, stripe_invoice_id)
        VALUES (p_livemode, p_event_id, p_event_type, p_subscription_id, p_invoice->>'id')
        ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN
        DELETE FROM public.stripe_billing_locks WHERE livemode = p_livemode
            AND stripe_subscription_id = p_subscription_id AND token = p_token;
        RETURN jsonb_build_object('state', 'duplicate');
    END IF;
    INSERT INTO public.stripe_subscriptions
        (livemode, stripe_subscription_id, stripe_customer_id, status, cancel_at_period_end, state)
        VALUES (p_livemode, p_subscription_id, p_subscription->>'customer_id',
            p_subscription->>'status', (p_subscription->>'cancel_at_period_end')::boolean, p_subscription)
        ON CONFLICT (livemode, stripe_subscription_id) DO UPDATE SET
            stripe_customer_id = EXCLUDED.stripe_customer_id, status = EXCLUDED.status,
            cancel_at_period_end = EXCLUDED.cancel_at_period_end,
            state = EXCLUDED.state, updated_at = now();
    IF p_invoice IS NOT NULL THEN
        INSERT INTO public.stripe_subscription_invoices
            (livemode, stripe_invoice_id, stripe_subscription_id, status, amount_due_cents, amount_paid_cents, currency, state)
            VALUES (p_livemode, p_invoice->>'id', p_subscription_id, p_invoice->>'status',
                (p_invoice->>'amount_due')::bigint, (p_invoice->>'amount_paid')::bigint,
                p_invoice->>'currency', p_invoice)
            ON CONFLICT (livemode, stripe_invoice_id) DO UPDATE SET
                status = EXCLUDED.status, amount_due_cents = EXCLUDED.amount_due_cents,
                amount_paid_cents = EXCLUDED.amount_paid_cents, currency = EXCLUDED.currency,
                state = EXCLUDED.state, updated_at = now();
    END IF;
    DELETE FROM public.stripe_billing_locks WHERE livemode = p_livemode
        AND stripe_subscription_id = p_subscription_id AND token = p_token;
    RETURN jsonb_build_object('state', 'applied');
END;
$$;
REVOKE ALL ON FUNCTION public.cx_claim_stripe_billing(text, boolean, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cx_apply_stripe_billing(text, text, boolean, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cx_claim_stripe_billing(text, boolean, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cx_apply_stripe_billing(text, text, boolean, text, text, jsonb, jsonb) TO service_role;
COMMIT;
