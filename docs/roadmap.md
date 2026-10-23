# Roadmap

| Phase | Deliverable | Done when | Status |
|---|---|---|---|
| **1. Site + PWA** | Quartz v5 set up, pt-BR, a few sample notes, manifest, service worker, update prompt, iOS install guide, Pages deploy workflow | Installed on a real iPhone and Android phone, browsable in airplane mode | Not started |
| **2. Ingest pipeline** | Docling extraction (DOCX/PDF/PPTX), `glossary.yml`, linker, `sources.lock`, `/ingest` skill, PR flow | One real section ingested and reviewed through a PR | Not started |
| **3. Hardening** | Playwright offline tests, Lighthouse CI, image optimisation, size budget | CI checks green on every PR | Not started |
| **4. Bulk ingest** | All ~20 sections ingested; glossary reviewed with the teacher | Full course available offline | Not started |

Phase 1 comes first because offline behaviour on iOS is the biggest risk.

## Open questions

- How does Quartz v5 slugify accented titles? Does its search ignore accents?
- How does v5's plugin/emitter API work? It decides whether the PWA step is a Quartz plugin or a separate post-build script.
- One note per section, or split long sections by topic? Decide on the first real section.
- Size budget value for CI.
- App name, icon and colours for the manifest.
