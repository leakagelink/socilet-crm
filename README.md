# Socilet CRM

Local-first CRM for projects, finance, and operations. Edit on this machine, commit, push to GitHub — hosting updates from GitHub, not from Cloud Agent.

## Localhost (this is the source of truth for development)

```bat
cd C:\Users\Dell\socilet-panel
dir package.json
npm install
npm run dev
```

Open **http://127.0.0.1:43721**

Hostinger cannot run `npm run dev`. Production is `npm run build` then the `dist/` folder (uploaded by GitHub Actions / Hostinger Git / Vercel / Netlify).

### Seed login (no public sign-up)

| Role | Email | Password | Access |
| --- | --- | --- | --- |
| Admin | `admin@socilet.local` | `Admin@Socilet1!` | Full CRM |
| Non-admin | `user@socilet.local` | `UserPass1234!` | Denied |

Roles live in `user_roles`, never on `profiles`.

The app runs with **zero** `VITE_*` keys (Dexie IndexedDB). Optional Supabase: copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

### Resend (socilet.in send + inbox)

Har mailbox alag: CRM **Emails** → name, `From` (jaise `hello@dusra-domain.com`), Resend API `re_…` → **Add & connect**. Inbox/sent/send usi box ke. Webhook: `https://crm.proofvault.space/api/email/inbound/<mailboxId>`. Keys GitHub par nahi — server `../.socilet-persist/mailboxes.json` (deploy folder ke bahar) + browser remember, taaki Git update ke baad boxes reconnect na karne padhein.

Hostinger Web App: add the same env vars in the panel (do not commit `.env`). After `npm run build`, run `node server.mjs` so `/api/email` exists in production. In Resend: receiving/MX for `socilet.in`, webhook `https://crm.proofvault.space/api/email/inbound` event `email.received`.

Rotate any key that was pasted in chat.

## Shipping rule

**Local change → `git add` → `git commit` → `git push origin main` → GitHub Action (or Hostinger Git / Vercel / Netlify) publishes `dist/`.**

No manual FTP after the first secret setup.

```bat
npm run ship
```

That is `git push origin main` (never force-push).

### Hostinger FTP (GitHub Actions)

Workflow: `.github/workflows/hostinger-ftp.yml`

1. GitHub **Secrets**: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `FTP_SERVER_DIR` (example `/public_html/`)
2. GitHub **Variable**: `ENABLE_HOSTINGER_FTP` = `true`
3. Optional: hPanel → Git connected to the same GitHub repo, branch `main`

Until the variable is `true`, the FTP job is skipped (so a push still succeeds).

### Vercel / Netlify

Connect the **same GitHub repo**. Build: `npm run build`. Output: `dist`. Push to `main` = live.

IndexedDB is per-browser. Shared hosting is not the database until Supabase is connected.

## GitHub (not Origin)

This folder should track GitHub HTTPS, never `origin.cursor.com`.

```bat
git remote -v
```

If you created an empty GitHub repo named `socilet-crm` (no README):

```bat
git branch -M main
git remote remove origin
git remote add origin https://github.com/dheeraj-tagde/socilet-crm.git
git push -u origin main
```

Replace `dheeraj-tagde` if your GitHub username is different. Use a GitHub personal access token or `gh auth login` — never a Gmail password as a git token.

Later clones:

```bat
cd C:\Users\Dell
git clone https://github.com/dheeraj-tagde/socilet-crm.git
cd socilet-crm
```

Then Cursor Desktop → File → Open Folder → only that clone (the folder that contains `package.json`).
