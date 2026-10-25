# Searchmenow Global Research Engine (SGRE)

SGRE is an in-site public-source research interface backed by modular Node.js collectors. The initial implementation connects to Wikipedia, Wikidata, GitHub, GitLab, ORCID, OpenAlex, Bluesky, Mastodon and Hacker News. Collectors run concurrently, isolate failures, normalize records, deduplicate URLs and rank evidence. It is not a claim of full coverage of every OSINT directory provider.

## Ranking algorithm: SGRE-1.0

`score = round(100 × (0.34T + 0.24B + 0.18E + 0.14S + 0.06C + 0.04K))`

- T: fraction of query tokens present in the title.
- B: fraction of query tokens present in title plus snippet.
- E: 1 for case-insensitive exact title match, else 0.
- S: documented source baseline weight.
- C: bounded completeness score for title, canonical URL, snippet and timestamp.
- K: bounded corroboration from distinct sources after URL deduplication.

Scores rank relevance and record completeness. They are not identity probabilities or proof two records refer to the same person. Identity resolution requires separately calibrated data, measured false-match rates and explainable uncertainty.

## Input classification

Explicit selected type wins. Auto mode checks IP, email, phone, domain/URL, username-shaped token, then name. Email, phone and IP are directed to existing dedicated lookup pages rather than fanned out across unrelated sources. Sensitive government ID formats are rejected.

## Connector contract

Use only allow-listed documented APIs; never turn arbitrary user input into a fetch URL. A failed provider is marked unavailable, not treated as a definitive no-match. New connectors need timeouts, source attribution, tests, license/terms review, and rate-limit handling.

## Reference projects and security

- SpiderFoot (MIT): https://github.com/smicallef/spiderfoot — modular collectors and evidence workflows; inspiration only, no code copied.
- OpenCTI connectors: https://github.com/OpenCTI-Platform/connectors — connector boundaries and enrichment patterns; check individual licenses.
- OpenCTI platform: https://github.com/OpenCTI-Platform/opencti — structured observables, relationships and provenance.
- OWASP API Security: https://github.com/OWASP/API-Security — safe API handling and resource-consumption controls.

Public sources only; no CAPTCHA, login, paywall or access-control bypass. Keep secrets server-side, escape output, respect source terms and rate limits, honor opt-outs, and never use results for eligibility decisions. Email breach, password, phone, IP and existing username checks remain on their existing dedicated endpoints. This first release does not integrate every listed directory tool as a dedicated live API.