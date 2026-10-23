# CFBXVI

Course material as an offline-first digital garden (Quartz v5 + PWA), published to GitHub Pages.

Site: https://katreque.github.io/CFBXVI/

## Develop

Requires Node 22+.

```sh
npm ci && npm ci --prefix pwa
npx quartz build --serve            # live preview of the content (no PWA)
```

Full production build with offline support, as CI runs it:

```sh
npx quartz build
npm --prefix pwa run build          # vendor assets, manifest, service worker
npm --prefix pwa run preview        # serve at http://localhost:8080/CFBXVI/
cd pwa && npx playwright test       # offline end-to-end tests
```

Pushing to `master` builds, tests and deploys. Pull requests run the same build and tests without deploying.

## Docs

See [docs/](docs/README.md) for architecture, decisions and the roadmap.
