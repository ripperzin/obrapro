-- Create table for landing page leads
create table if not exists landing_leads (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  name text,
  interest text, -- e.g. 'investor', 'builder'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table landing_leads enable row level security;

-- Policy to allow inserting leads (public access for landing page form)
create policy "Allow public insert to leads"
  on landing_leads for insert
  with check (true);

-- Policy to allow viewing leads only for authenticated admins (optional, but good practice)
-- using service_role for now or existing auth users logic if applicable.
-- For now, we only need insert.
