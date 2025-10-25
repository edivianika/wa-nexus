-- Add limits for kanban_boards and drip_campaigns to existing plans

-- For 'Free' and 'Trial' plans, set limit to 1 for both
UPDATE public.plans
SET 
  limits = limits || '{"kanban_boards": 1, "drip_campaigns": 1}'::jsonb
WHERE 
  id IN ('plan_free', 'plan_trial');

-- For 'Basic' plan, set limit to 5 for both
UPDATE public.plans
SET 
  limits = limits || '{"kanban_boards": 5, "drip_campaigns": 5}'::jsonb
WHERE 
  id = 'plan_basic';

-- For 'Premium' plan, set to unlimited (-1) for both
UPDATE public.plans
SET 
  limits = limits || '{"kanban_boards": -1, "drip_campaigns": -1}'::jsonb
WHERE 
  id = 'plan_premium'; 