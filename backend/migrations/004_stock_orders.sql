-- Run in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.stock_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol text NOT NULL,
  action text NOT NULL CHECK (action IN ('buy', 'sell')),
  quantity integer NOT NULL,
  order_type text NOT NULL DEFAULT 'market' CHECK (order_type IN ('market', 'limit')),
  limit_price numeric(10,4),
  fill_price numeric(10,4) NOT NULL DEFAULT 0,
  total_value numeric(15,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'filled',
  alpaca_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_stock_orders" ON public.stock_orders FOR ALL USING (auth.uid() = user_id);
CREATE INDEX ON public.stock_orders(user_id, created_at DESC);
