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

## Source directory audit — 25 October 2026

The OSINT directory in `server/osint-tools.js` is a launcher directory, not a set of 57 backend integrations. Its external links include general search and archives (Google, Bing, Internet Archive), username tools (WhatsMyName, Namechk), email exposure/reputation (HIBP, EmailRep), people/research (LinkedIn, ORCID, Wikidata), phone metadata (ITU), domain/DNS/certificate services (ICANN Lookup, DNSdumpster, crt.sh, SecurityTrails), IP/network (RIPEstat, ARIN RDAP, AbuseIPDB), social search (Reddit, Bluesky, Mastodon), images/media (Google Lens, TinEye, ExifTool, InVID-WeVerify), geospatial (OpenStreetMap, Google Maps, Google Earth, Sentinel Hub), corporate registries (MCA India, OpenCorporates, GLEIF), code/package records (GitHub, GitLab, npm, PyPI), threat intel (VirusTotal, Shodan, URLhaus, Censys), documents/publications (Google Scholar, Crossref), and correlation/reporting tools (Maltego, Obsidian).

### Integration review

- **Direct public API integrations added in this change:** Crossref REST API, Open Library Search API, Internet Archive Advanced Search API, npm Registry Search API, and crt.sh certificate-transparency search.
- **Existing direct integrations retained:** Wikipedia, Wikidata, GitHub, GitLab, ORCID, OpenAlex, Bluesky, Mastodon and Hacker News.
- **Still directory links or dedicated workflows, not claimed as live research-engine connectors:** Google/Bing, LinkedIn, WhatsMyName, Namechk, HIBP breach search, EmailRep, phone lookup, DNS/WHOIS, RIPEstat, AbuseIPDB, Reddit, Google Lens/TinEye, map/satellite sources, MCA/OpenCorporates/GLEIF, VirusTotal/Shodan/URLhaus/Censys, Google Scholar, and Maltego. These require provider-specific APIs, local tools, credentials, or terms review; a homepage link is not a live data integration.
- **Data quality controls:** every collector has a timeout; failures are isolated and surfaced as unavailable; results retain their source URL; outputs are normalized and deduplicated; relevance is not represented as identity certainty. crt.sh requests are restricted to valid domain-shaped inputs and use a fixed upstream host. No arbitrary URL fetching, authentication bypass, CAPTCHA bypass, or port scanning is added.
- **Operational limits:** public API access is rate-limited by upstream providers and can be unavailable. The UI must show actual responding-source status. A zero-result response means no match was returned by queried sources, not proof that no record exists.
- **Privacy and legal scope:** use only public data for legitimate research, honor opt-outs and provider terms, avoid sensitive government identifiers, and do not use the output as an eligibility decision. No provider's proprietary frontend or backend implementation is copied.

### Public API references reviewed

- Crossref REST API: https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- Open Library Search API and usage guidelines: https://openlibrary.org/developers/api and https://openlibrary.org/dev/docs/api/search
- Internet Archive item search API: https://doc-tools.readthedocs.io/en/ia-test-gsod/item-search-apis.html
- npm Registry API: https://api-docs.npmjs.com/
- crt.sh certificate transparency search: https://crt.sh/
