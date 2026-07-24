# Access Control (password gate)

The published site is gated behind a **single shared password** using
[StatiCrypt](https://github.com/robinmoisson/staticrypt). GitHub Pages is static
hosting with no server, so there is no true server-side auth — StatiCrypt is the
strongest option that stays on the existing Pages pipeline.

## How it works

1. `npm run build` produces the static site in `dist/`.
2. `npm run protect` runs StatiCrypt over `dist/`, **AES-256-encrypting every HTML
   page in place** (CSS/JS/other assets are left untouched). Each page is replaced
   with a small password prompt; the real content is an encrypted blob.
3. A visitor enters the password, and the page is decrypted **in their browser**.

Both steps run in CI on every push to `main` (see
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)); only the
encrypted output is uploaded to GitHub Pages.

## Setting / rotating the password

The password is **not** stored in the repo. It comes from a GitHub Actions secret:

- **Name:** `SITE_PASSWORD`
- **Where:** repo *Settings → Secrets and variables → Actions → New repository secret*
- Or via CLI: `gh secret set SITE_PASSWORD` (you'll be prompted for the value)

To **rotate** the password, update that secret and re-run the deploy (push to `main`,
or *Actions → Deploy to GitHub Pages → Run workflow*). The new build re-encrypts with
the new password; the old one stops working after the deploy completes.

If the secret is missing, the deploy **fails fast** with a clear error (it does not
publish an unprotected site).

## Security model — read this

- **Shared password, not per-user.** Everyone with the link uses the same password.
  To revoke access you rotate the password and re-deploy; you can't revoke one person.
- **Client-side encryption.** The encrypted content is public on GitHub Pages, so a
  determined attacker could attempt an **offline brute-force**. Use a **strong
  passphrase** (long, random) to make that impractical. Good enough for gating
  research behind a webinar invite; **not** for truly secret data.
- **Only HTML is encrypted.** JS/CSS bundles and `sitemap.xml` remain public. That
  exposes page *URLs/slugs* (i.e. technique names), but not the page *content*.
- If you later need real per-user auth (revocable, audit logs), move the site to a
  custom domain behind **Cloudflare Access** — see the note in the deploy discussion.

## Local preview of the gate

```bash
npm run build
STATICRYPT_PASSWORD="whatever-you-want" npm run protect
npm run preview   # serve the encrypted dist/ and test the password prompt
```

(Remember to `npm run build` again afterward if you want an unencrypted `dist/` back.)

## Notes

- The **salt** (`--salt a3f1…` in the `protect` script) is not a secret; it only needs
  to be stable, so it's committed in `package.json`. The **password** is the secret.
- Encrypted pages are not indexable by search engines — which is the intended effect.
