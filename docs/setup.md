# Setup and GitHub

This project is designed to run with **zero paid services**. The only account you need is GitHub.

## What is already installed here

Checked on this machine:

- Node.js `v24.21.0`
- npm `11.19.0`
- Git `2.56.0`
- Python `3.12.10` (optional, only for offline `rembg` experiments)
- GitHub CLI `2.104.0` (installed during setup)
- `winget` for future installs

## One-time GitHub login

GitHub cannot log in for you — it needs a browser approval. Run this in your own terminal:

```powershell
gh auth login
```

If PowerShell says `gh` is not recognized, open a new terminal or use the full path:

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" auth login
```

Choose:

1. **GitHub.com**
2. **HTTPS**
3. **Yes** — authenticate Git with your GitHub credentials
4. **Login with a web browser**
5. Copy the one-time code, press Enter, paste the code in the browser, and approve.

Then confirm:

```powershell
gh auth status
gh auth setup-git
```

`gh auth setup-git` makes Git use GitHub CLI as its credential helper. Without it, `git push` may ask for a password, which GitHub no longer accepts.

## Set your commit identity

Use your real name (or a handle) and a GitHub email. The noreply address keeps your personal email out of public commits:

```powershell
$login = gh api user --jq .login
$id = gh api user --jq .id

git config --global user.name "Your Name"
git config --global user.email "$id+$login@users.noreply.github.com"
```

Verify:

```powershell
git config --global user.name
git config --global user.email
```

## Create the repository and push

From the project folder:

```powershell
gh repo create wardrobe --public --source=. --remote=origin --push
```

If you already created the repository on github.com, use:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/wardrobe.git
git push -u origin main
```

A public repository is recommended because:

- it is a portfolio piece;
- GitHub Pages is free for public repositories on free accounts;
- GitHub Actions minutes are free for public repositories.

If you want it private, keep it private and deploy to Cloudflare Pages later — still free, but one more account.

## Run the app locally

```powershell
npm install
npm run dev
```

Vite prints a Local URL and a Network URL. Open the Local URL on your computer.

### Test on your phone

1. Connect the phone and computer to the same Wi-Fi.
2. Open the **Network** URL from Vite (for example `http://192.168.0.116:5173`).
3. Allow Node.js through Windows Firewall if prompted.

The dev server is already configured with `host: true`.

## Deploy to GitHub Pages (later, still free)

1. Push the repository to GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds the app and publishes it.
5. The URL will look like `https://YOUR_USERNAME.github.io/wardrobe/`.

`vite.config.ts` already uses `base: './'`, so assets work under the `/wardrobe/` subpath.

## Optional: local background removal

Not needed — the app removes backgrounds in the browser. If you want a higher-quality,
scriptable cutout for experiments, `rembg` still works offline:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install rembg
rembg i input.jpg output.png
```

Keep experiment images and outputs out of Git. You can import the resulting transparent PNG through the normal add flow.

## Optional: remote garment recognition

Not needed — the app recognizes colors locally, with no key and no network. The
rest of the attributes are editable by hand. If you want a vision model to
pre-fill the name, category, optional attributes, and scoring hints, there is an
opt-in path:

1. Deploy `server/recognize.ts` as a function at `/api/recognize` on a host you
   control. The file is a platform-neutral `Request → Response` handler; adapt
   the export to your host if needed.
2. Set the server environment:
   - `RECOGNITION_API_KEY` — required, never committed.
   - `RECOGNITION_API_URL` — defaults to an OpenAI-compatible chat endpoint.
   - `RECOGNITION_MODEL` — defaults to `gpt-4o-mini`.
   - `RECOGNITION_RATE_LIMIT_PER_MINUTE` — optional, default 20; `0` disables the
     best-effort single-instance limiter.
   - `RECOGNITION_ALLOWED_ORIGINS` — optional comma-separated CORS allowlist for
     a cross-origin function host. This is not authentication.
3. Set `VITE_RECOGNITION_PROVIDER=ai` in `.env.local` (or in the build
   environment) and rebuild. `.env.local` is gitignored.

```dotenv
# Browser-visible: only selects the provider, never holds a secret.
VITE_RECOGNITION_PROVIDER=ai

# Server-only. Do not prefix these with VITE_.
RECOGNITION_API_KEY=your-key
RECOGNITION_API_URL=https://api.openai.com/v1/chat/completions
RECOGNITION_MODEL=gpt-4o-mini
RECOGNITION_RATE_LIMIT_PER_MINUTE=20
# RECOGNITION_ALLOWED_ORIGINS=https://your-site.example
```

What leaves the browser in this mode: one downscaled WebP (longest edge
1024 px) posting `{ imageBase64, mimeType }`. If the browser cannot prepare the
image, the original is never uploaded; the app uses the local heuristic. The
function then sends the image to the vision provider you configured. No wardrobe
data, item names, or notes are sent. If the function fails with a network error
or a transient 5xx, the app retries once and then falls back to the local
heuristic; permanent 4xx, auth, rate-limit, and timeout outcomes go straight to
the fallback. Recognition never blocks saving.

**Do not expose this function as a public paid proxy.** The reference handler
has a request-body cap, image-signature validation, a 15-second upstream
timeout, safe error codes, and an in-memory rate limiter, but no authentication
and no distributed rate limiting. Add platform-level abuse protection and a
spending cap in the provider dashboard before enabling it publicly. CORS is not
authentication.

This path is outside the project's zero-dollar default and outside what the
maintainer deploys to GitHub Pages. Check the provider's pricing and privacy
terms before turning it on. Keep the key on the server: `VITE_` variables are
compiled into the public JavaScript bundle. The reference endpoint has not been
exercised against a live vision provider in this repository; run a real
integration test before relying on it.

## Free API notes

- **Open-Meteo** — free for non-commercial use, no key. Check the current terms before publishing a commercial app.
- **remove.bg / Photoroom** — free trials only; not part of this plan.
- **Vision APIs** — optional and self-hosted only. They are not on the free
  path; the default recognizer needs no account or key.
- **GitHub Actions** — 2,000 minutes/month on the free plan for private repos; free for public repos.
- **Supabase** — free tier exists, but it is not needed until multi-device sync. Do not add it early.

## Troubleshooting

**`gh: command not found`** — close and reopen the terminal after installing GitHub CLI. If it still fails, use the full path shown by `winget list GitHub.cli`.

**`git push` asks for a password** — run `gh auth setup-git` and push again. GitHub requires a token or browser auth, not an account password.

**The phone cannot open the Network URL** — check that both devices are on the same Wi-Fi, allow Node.js in Windows Firewall, and use the exact IP Vite printed.

**Photos disappear after clearing browser data** — that is expected. IndexedDB is per browser profile. Export a backup first; import it to restore.

**The app looks empty after a hard refresh** — check the browser console for IndexedDB errors. Private browsing may block or evict storage.
