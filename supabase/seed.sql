-- VeloCity Field Service - Seed Data

-- Service Areas
insert into service_areas (name, city, state, zip_codes) values
  ('Greater Austin', 'Austin', 'TX', array['78701','78702','78703','78704','78705','78731','78741','78745','78748','78750']),
  ('Greater Dallas', 'Dallas', 'TX', array['75201','75202','75203','75204','75205','75206','75209','75214','75218','75230']),
  ('Greater Houston', 'Houston', 'TX', array['77001','77002','77003','77004','77005','77006','77007','77008','77009','77019']);

-- Note: Actual users/profiles are created via Supabase Auth
-- The following is for reference only and requires auth user IDs

-- Demo data for development:
-- Customer: customer@velocity.dev / password: velocity123
-- Provider: provider@velocity.dev / password: velocity123
-- Admin: admin@velocity.dev / password: velocity123
