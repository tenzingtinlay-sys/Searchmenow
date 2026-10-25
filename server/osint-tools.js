// Curated OSINT tool directory for Searchmenow. Original OSINT Framework: https://osintframework.com/ (MIT project: https://github.com/lockfale/OSINT-Framework).
// This is an independently curated subset; external tools remain owned by their maintainers.
module.exports = [
  { id: 'general-search', name: 'General Search & Discovery', description: 'Search engines and public web discovery.', tools: [
    { name: 'Google Search', url: 'https://www.google.com/', purpose: 'Search indexed public webpages.' },
    { name: 'Bing', url: 'https://www.bing.com/', purpose: 'Search indexed public webpages.' },
    { name: 'Internet Archive', url: 'https://web.archive.org/', purpose: 'View archived versions of public websites.' },
    { name: 'Google Advanced Search', url: 'https://www.google.com/advanced_search', purpose: 'Narrow public web searches with operators and filters.' }
  ]},
  { id: 'username', name: 'Username & Public Profiles', description: 'Find public profile pages associated with a handle.', internal: '/social-search', tools: [
    { name: 'Searchmenow Username Search', url: '/social-search', purpose: 'Check a username against supported public profile URLs.', internal: true },
    { name: 'WhatsMyName', url: 'https://whatsmyname.app/', purpose: 'Username search across public sites.' },
    { name: 'Namechk', url: 'https://namechk.com/', purpose: 'Check public username and domain availability.' },
    { name: 'GitHub Users', url: 'https://github.com/search', purpose: 'Search public developer profiles and repositories.' }
  ]},
  { id: 'email', name: 'Email & Exposure', description: 'Validate addresses and check known public breach exposure.', internal: '/lookup?type=email', tools: [
    { name: 'Searchmenow Email Validation', url: '/lookup?type=email', purpose: 'Validate syntax and check domain mail records.', internal: true },
    { name: 'Searchmenow Breach Check', url: '/breach-search', purpose: 'Check supported breach sources for an email address.', internal: true },
    { name: 'Have I Been Pwned', url: 'https://haveibeenpwned.com/', purpose: 'Check known breach exposure using the provider’s own service.' },
    { name: 'EmailRep', url: 'https://emailrep.io/', purpose: 'Review available reputation signals for an email.' }
  ]},
  { id: 'people', name: 'People & Professional Research', description: 'Public biographies and professional or academic profiles.', internal: '/people-search', tools: [
    { name: 'Searchmenow People Search', url: '/people-search', purpose: 'Search supported public profile and reference sources.', internal: true },
    { name: 'LinkedIn', url: 'https://www.linkedin.com/', purpose: 'Search publicly accessible professional profiles.' },
    { name: 'ORCID', url: 'https://orcid.org/orcid-search/search', purpose: 'Find public researcher identifiers and affiliations.' },
    { name: 'Wikidata', url: 'https://www.wikidata.org/', purpose: 'Search structured public knowledge records.' }
  ]},
  { id: 'phone', name: 'Phone Number Research', description: 'Number format and public numbering metadata, not live tracking.', internal: '/lookup?type=phone', tools: [
    { name: 'Searchmenow Phone Validation', url: '/lookup?type=phone', purpose: 'Validate number format and available country/carrier metadata.', internal: true },
    { name: 'Google Search', url: 'https://www.google.com/', purpose: 'Search for a number only where it has been publicly posted.' },
    { name: 'ITU Numbering Resources', url: 'https://www.itu.int/', purpose: 'Reference official international numbering information.' }
  ]},
  { id: 'domain', name: 'Domain, DNS & Website', description: 'Research domains and public internet infrastructure.', internal: '/deep-search', tools: [
    { name: 'Searchmenow Deep Search', url: '/deep-search', purpose: 'Follow public links from a website or keyword.', internal: true },
    { name: 'ICANN Lookup', url: 'https://lookup.icann.org/', purpose: 'Look up available domain registration data.' },
    { name: 'DNSdumpster', url: 'https://dnsdumpster.com/', purpose: 'Explore publicly observable DNS records.' },
    { name: 'crt.sh', url: 'https://crt.sh/', purpose: 'Search public certificate-transparency records.' },
    { name: 'SecurityTrails', url: 'https://securitytrails.com/', purpose: 'Domain and DNS intelligence; provider limits may apply.' }
  ]},
  { id: 'ip', name: 'IP, Network & Hosting', description: 'Review public IP allocation, network and geolocation metadata.', internal: '/lookup?type=ip', tools: [
    { name: 'Searchmenow IP Lookup', url: '/lookup?type=ip', purpose: 'Review available IP geolocation and ISP metadata.', internal: true },
    { name: 'RIPEstat', url: 'https://stat.ripe.net/', purpose: 'Inspect public routing and IP allocation information.' },
    { name: 'ARIN RDAP', url: 'https://search.arin.net/rdap/', purpose: 'Look up public registry records for IP resources.' },
    { name: 'AbuseIPDB', url: 'https://www.abuseipdb.com/', purpose: 'Review reported abuse indicators; some features require an account.' }
  ]},
  { id: 'social', name: 'Social Media & Public Posts', description: 'Search public posts and profile pages without bypassing access restrictions.', tools: [
    { name: 'Google Search', url: 'https://www.google.com/', purpose: 'Find indexed public posts and profile pages.' },
    { name: 'Reddit Search', url: 'https://www.reddit.com/search/', purpose: 'Search public Reddit posts and communities.' },
    { name: 'Bluesky Search', url: 'https://bsky.app/', purpose: 'Browse publicly available Bluesky content.' },
    { name: 'Mastodon', url: 'https://joinmastodon.org/servers', purpose: 'Discover public posts on accessible instances.' }
  ]},
  { id: 'images', name: 'Images & Public Media', description: 'Search images and inspect media provenance responsibly.', tools: [
    { name: 'Google Lens', url: 'https://lens.google/', purpose: 'Search visually similar images.' },
    { name: 'TinEye', url: 'https://tineye.com/', purpose: 'Find where an image appears publicly on the web.' },
    { name: 'ExifTool', url: 'https://exiftool.org/', purpose: 'Inspect metadata in files you are authorized to analyze.' },
    { name: 'InVID-WeVerify', url: 'https://www.invid-project.eu/tools-and-services/invid-verification-plugin/', purpose: 'Support verification of public images and videos.' }
  ]},
  { id: 'geospatial', name: 'Maps & Geospatial Research', description: 'Research places and imagery—not private or real-time whereabouts.', tools: [
    { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/', purpose: 'Search public map features and places.' },
    { name: 'Google Maps', url: 'https://maps.google.com/', purpose: 'Research public places, business listings and map information.' },
    { name: 'Google Earth', url: 'https://earth.google.com/', purpose: 'Explore geographic imagery and terrain.' },
    { name: 'Sentinel Hub EO Browser', url: 'https://apps.sentinel-hub.com/eo-browser/', purpose: 'Explore satellite and Earth-observation imagery.' }
  ]},
  { id: 'business', name: 'Companies & Public Records', description: 'Research organizations through official registries and published records.', tools: [
    { name: 'MCA India', url: 'https://www.mca.gov.in/', purpose: 'Use official Indian corporate registry resources.' },
    { name: 'OpenCorporates', url: 'https://opencorporates.com/', purpose: 'Search available public company registry records.' },
    { name: 'GLEIF LEI Search', url: 'https://search.gleif.org/', purpose: 'Search legal-entity identifiers and registered entity data.' }
  ]},
  { id: 'code', name: 'Code & Technical Footprint', description: 'Public repositories, package records and exposed project documentation.', tools: [
    { name: 'GitHub Search', url: 'https://github.com/search', purpose: 'Search public repositories, issues and code.' },
    { name: 'GitLab Explore', url: 'https://gitlab.com/explore', purpose: 'Explore public projects and repositories.' },
    { name: 'npm', url: 'https://www.npmjs.com/', purpose: 'Search public JavaScript package metadata.' },
    { name: 'PyPI', url: 'https://pypi.org/', purpose: 'Search public Python package metadata.' }
  ]},
  { id: 'security', name: 'Security & Threat Intelligence', description: 'Passive checks for authorized security research.', tools: [
    { name: 'VirusTotal', url: 'https://www.virustotal.com/', purpose: 'Review existing reputation results for URLs, domains and files.' },
    { name: 'Shodan', url: 'https://www.shodan.io/', purpose: 'Search indexed internet-exposed services; API access may be limited.' },
    { name: 'URLhaus', url: 'https://urlhaus.abuse.ch/', purpose: 'Review known malicious URL intelligence.' },
    { name: 'Censys', url: 'https://search.censys.io/', purpose: 'Search indexed internet infrastructure records.' }
  ]},
  { id: 'documents', name: 'Documents & Archives', description: 'Locate public documents and historical copies.', tools: [
    { name: 'Internet Archive', url: 'https://web.archive.org/', purpose: 'Find archived pages and public web documents.' },
    { name: 'Google Scholar', url: 'https://scholar.google.com/', purpose: 'Search published scholarly literature.' },
    { name: 'Crossref', url: 'https://search.crossref.org/', purpose: 'Search bibliographic metadata and publications.' }
  ]},
  { id: 'workflow', name: 'Correlation & Reporting', description: 'Organize findings with provenance, confidence and reproducibility.', tools: [
    { name: 'Searchmenow Deep Search', url: '/deep-search', purpose: 'Expand from supported identifiers and inspect linked evidence.', internal: true },
    { name: 'Maltego', url: 'https://www.maltego.com/', purpose: 'Visualize relationships between entities.' },
    { name: 'Obsidian', url: 'https://obsidian.md/', purpose: 'Organize research notes and source references locally.' }
  ]}
];
