# Star Trek Books

Next.js catalogue and personal reading tracker.

- Star Trek bibliography parsed from Wikipedia with rowspan-aware table handling.
- Passwordless email authentication and reading-state persistence via Supabase.
- Goodreads rating snapshots are stored in `goodreads_metadata` and joined into the catalogue.
- Goodreads metadata is intentionally cached; Goodreads no longer provides the old public API for new integrations.

## Environment

Copy `.env.example` to `.env.local` and supply the Supabase URL and publishable key.

Deployment is connected to Vercel from the `main` branch.
