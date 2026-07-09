-- Add business_type column to leads table
-- Tracks which business type generated the lead (Real Estate, Car Dealership, etc.)

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS business_type text DEFAULT 'Unknown';

-- Update existing leads based on their source
UPDATE public.leads
  SET business_type = 'Real Estate'
  WHERE source = 'AI Agent (Inbound)' AND business_type = 'Unknown';

UPDATE public.leads
  SET business_type = 'Car Dealership'
  WHERE source LIKE '%Car%' AND business_type = 'Unknown';

-- Add index for faster filtering by business type
CREATE INDEX IF NOT EXISTS idx_leads_business_type ON public.leads(business_type);
