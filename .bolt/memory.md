# Project memory

## Product intent & audience

- School records management system (विद्यालयका रेकर्ड व्यवस्थापन प्रणाली)
- Users: school administrators / staff who log in and manage records
- Authentication required before accessing records

## Brand personality & voice

- Communication in **Nepali** (नेपाली)
- Explanatory tone: uses simple analogies (app = दराज/खिड्की, database = भण्डार) to explain architecture to non-technical users
- Direct, reassuring, clear

## Visual design & UX direction

- Framework: **Vite + React**
- Hosting-agnostic: app may run on Vercel, Bolt, or elsewhere; data always sourced from Supabase
- No specific visual/aesthetic decisions inferred yet

## Decisions, constraints & rationale

- **Supabase** is the sole database & auth provider — project ID: `qupayybevhogirzxcsna`
- Architecture: app (frontend) contains no persistent data; all reads/writes go through Supabase
- Auth method: email + password via Supabase Auth; password-set flow sends an email link
- Current Supabase project has **zero user accounts**; previous accounts likely created in a different Supabase project or database
- First admin account must be created inside the current project before login works

## Open questions & assumptions

- Which Supabase project was used previously, and should data/accounts be migrated?
- What is the admin email for the first account?
- What specific school record types does the system manage (students, staff, attendance, grades, fees)?
- Full feature scope beyond auth and records is not yet defined