# Quickstart: Supplier Directory

**Feature**: `001-supplier-directory` | **Date**: 2026-09-06

Assumes this is the first feature scaffolded in the repo (no `package.json` yet — created during `/sp.implement` per tasks.md, not here).

## Prerequisites

- Node.js 20+
- A Firebase project with Firestore and Authentication (Email/Password provider) enabled
- Firebase CLI (`npm install -g firebase-tools`) for running the Firestore Emulator locally

## Environment variables

```env
# Client-side Firebase config (safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=

# Server-only Firebase Admin credentials (never exposed to the client)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

## Local development

```bash
npm install
firebase emulators:start --only firestore,auth   # in one terminal
npm run dev                                       # in another
```

## Manual verification flow (matches spec acceptance scenarios)

1. Sign in with a staff test account (Firebase Auth email/password, seeded in the emulator).
2. **Create** (User Story 1): Go to "Add Supplier", submit with company name, one contact (name + email), an address, one material tag, and payment terms → confirm it appears in the list with status "active".
3. Submit the form again with no company name → confirm a validation error is shown and nothing is saved.
4. **Search & filter** (User Story 2): With several suppliers seeded, type a partial name into search → confirm only matches show. Apply a material filter and a status filter together → confirm the list narrows correctly. Search for something matching nothing → confirm an explicit empty state.
5. **Edit & deactivate** (User Story 3): Open an existing supplier, edit its payment terms, save → confirm the change is reflected. Deactivate it → confirm it disappears from the default (active) list but appears when filtering by "inactive". Reactivate it → confirm it reappears in the default list.

## Tests

```bash
npm run test          # Vitest unit tests (schema + service functions)
npm run test:integration  # Server Actions against the Firestore Emulator
```
