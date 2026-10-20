# AgencyOS international SEO and AI search

## Search intent and page map

The public app and landing content use **AgencyOS** as the product name and describe the product as a browser-based proposal and business-document generator for agencies and freelancers. The localized landing pages target language audiences rather than claiming country-specific editions:

| URL | Language | Initial search-intent phrases |
| --- | --- | --- |
| `/` | German | KI-Angebotssoftware, Angebot erstellen, Angebote für Freelancer und Agenturen |
| `/en/` | English | AI proposal generator, proposal software for agencies and freelancers |
| `/fr/` | French | logiciel de devis IA, proposition commerciale |
| `/es/` | Spanish | generador de propuestas con IA, propuestas comerciales |
| `/id/` | Indonesian | pembuat proposal AI, proposal untuk freelancer |
| `/zh-hans/` | Simplified Chinese | AI 项目提案工具, 代理机构提案 |
| `/zh-hant/` | Traditional Chinese | AI 專案提案工具, 代理商提案 |
| `/ja/` | Japanese | AI提案書作成, 代理店・フリーランス向け |

These are relevant query-language seeds based on the current product and live search-result phrasing. They are **not** volume, difficulty, or ranking estimates: Ahrefs returned `Insufficient plan` for its project, audit, traffic, and keyword-data endpoints. Do not treat the seed list as a validated keyword forecast.

The landing content describes the document types, input fields, output languages, PDF export, guest-mode limit, and Pro sharing/signature features. It also tells users that the product interface is currently German. This distinction matters: document generation supports eight language choices, while localized page copy does not mean the whole application UI is translated.

## Technical setup

- Canonical host: `https://agencyos.com/`.
- Each language has a stable URL, reciprocal `hreflang` links, a self-canonical URL, visible language links, and an `x-default` fallback to German.
- `public/sitemap.xml` lists the eight public landing URLs. Legal pages and the share-document viewer are intentionally excluded; the viewer already carries `noindex`.
- `public/robots.txt` allows Google, Bing, OpenAI search/retrieval, Claude search/retrieval, and other compliant crawlers while excluding API paths from crawler requests. Robots rules are not an access-control mechanism.
- `/index.html` redirects to `/` while retaining query parameters. Unknown paths return 404 instead of the app shell.
- The landing pages are static HTML and do not need JavaScript to expose their text, headings, language links, or structured data.
- No `llms.txt` was added as a search-ranking tactic. Google Search's current AI guidance says it is not used for Search visibility; the work follows its crawlability, localization, and useful-content guidance instead.

The crawl and localization setup follows [Google's AI Search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) and [multilingual-site guidance](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites). Search-oriented retrieval is allowed for [OpenAI's OAI-SearchBot](https://developers.openai.com/api/docs/bots) and [Anthropic's Claude-SearchBot and Claude-User](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler). Once the domain is live, [Bing Webmaster Tools' AI Performance report](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/) can provide citation measurements.

## Production readiness and measurement

The canonical domain is not currently serving AgencyOS. A live request to `https://agencyos.com/` returned HTTP 405 from a domain-parking server, and its A record resolved to `64.190.63.222`. The deployment notes in `docs/server-deployment.md` identify `169.58.121.93` as the intended server address. The DNS/hosting owner must make the domain point to the intended live service before crawlers can fetch these changes.

After the domain serves the app:

1. Verify the property in Google Search Console and Bing Webmaster Tools; submit `/sitemap.xml` and inspect the localized URLs.
2. Confirm each language page returns HTTP 200, the canonical host is consistent, crawler requests are not challenged by a firewall, and `/index.html` redirects with query strings intact.
3. Review Bing Webmaster Tools' AI Performance report and Search Console's available generative-AI reporting, then update content from actual cited-page and search-query evidence.
4. Add IndexNow only after generating and hosting its verification key. Do not invent or commit a key.
5. Revisit phrase choices with Google Search Console, Bing Webmaster Tools, and an Ahrefs plan that returns keyword and crawl data. The current phrases are a starting point, not claims of search volume.

These foundations improve crawl and interpretation readiness; they cannot guarantee indexing, rankings, or citations by Google, Bing, ChatGPT, Grok, Gemini, Claude, or browser agents.
