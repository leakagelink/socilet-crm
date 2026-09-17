# Windows — Socilet CRM

## Open the right folder

Cursor Desktop → **File → Open Folder** → the folder that contains `package.json` (this project). Not the parent `Dell` folder.

## First run

```bat
cd /d C:\Users\Dell\socilet-panel
dir package.json
npm install
npm run dev
```

Browser: http://127.0.0.1:43721

Admin: `admin@socilet.local` / `Admin@Socilet1!`

If port 43721 is busy, stop the other process. `strictPort` is on — Vite will not pick another port.

## Production vs localhost

| Where | Command |
| --- | --- |
| This PC | `npm run dev` |
| Hostinger / static host | `npm run build` → publish `dist/` |

Do not expect `npm run dev` on shared hosting.

## GitHub push (auto-deploy)

```bat
git add .
git commit -m "Your message"
git push origin main
```

Or `npm run ship` (plain `git push origin main`, no force).

GitHub Actions deploys `dist/` over FTP when `ENABLE_HOSTINGER_FTP` is `true` and FTP secrets are set.

## Auth note

Never use your Gmail password as a GitHub token. Create a PAT (repo scope) or install GitHub CLI and run `gh auth login`.
