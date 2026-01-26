-- ==============================================================================
-- AUTOMATION: AUTO-ASSIGN OWNER ON PROJECT CREATION
-- DATA: 25/01/2025
-- ==============================================================================

-- 1. Create the Function (The Robot Logic)
create or replace function public.handle_new_project()
returns trigger
language plpgsql
security definer -- Runs with superuser privileges
as $$
begin
  -- Inserts the creator as the 'owner' in project_members
  insert into public.project_members (project_id, user_id, role)
  values (new.id, auth.uid(), 'owner');
  
  return new;
end;
$$;

-- 2. Create the Trigger (The Event Listener)
drop trigger if exists on_project_created on projects;

create trigger on_project_created
  after insert on projects
  for each row
  execute function public.handle_new_project();
