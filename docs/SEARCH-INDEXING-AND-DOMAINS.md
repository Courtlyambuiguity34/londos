# Public search indexing and your domain

Londos can expose published shops, departments, products and services to search
engines. Visitors can browse them in an ordinary browser: installing the PWA or
signing in is not required. Account, shopkeeper and landlord access checks still
apply to private workspaces. PostgreSQL remains authoritative; MongoDB, Redis and
AI credentials are not required for indexing.

## What is indexed

- The mall entrance and category pages.
- Public shops with a published design, active publication, active/due/grace
  tenancy, clear moderation and no operator pause.
- All non-archived departments and non-archived products/services in those shops,
  including products beyond the first shop or department page. Out-of-stock
  items can remain public; archived items cannot.

The sitemap includes only canonical public URLs. It never includes account
records, emails, draft previews, payment details or private workspaces. Private
and search-result pages retain `noindex`; cursor pages are excluded. Canonical
links use the configured `AUTH_BASE_URL`, never a visitor-supplied host header.
Existing shop-address aliases redirect to their current shop URL.

Merchant workflow: sign in, update the catalogue, save/preview the shop design,
then publish it using the existing publication controls. Public catalogue edits
are live under the existing catalogue rules; a draft layout is not published by
this change. Clear names and descriptions help discovery. Publishing does not
override rent, moderation, pause or application requirements.

`/sitemap.xml` lists dynamically generated child sitemaps, with at most 5,000 URLs
per catalogue shard. Responses use `no-store` and eligibility is checked again
on each request. Unpublishing, archiving, closing, pausing or moderating a shop
removes its affected URLs from subsequent sitemap responses. Search engines
may retain previous results until they recrawl; sitemap removal is not instant
removal from Google. The reader independently checks visibility on every visit.
Robots directives are crawler guidance, **not authorization controls**.

## Connect a purchased domain to Render

Official sources checked **2026-10-20**:

- [Render: Custom Domains](https://render.com/docs/custom-domains)
- [Render: DNS configuration](https://render.com/docs/configure-other-dns)
- [Google: sitemap overview](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)

1. Buy the domain from your preferred registrar. Keep the existing working
   `onrender.com` origin configured until the new domain passes verification.
2. In Render select the **web service**, open **Settings → Custom Domains**,
   choose **+ Add Custom Domain**, enter the domain, then **Save**.
3. In the domain's authoritative DNS provider, add the records Render requests.
   For a subdomain such as `www`, use a CNAME pointing to the service's
   `onrender.com` hostname (no `https://` or path). For an apex/root domain, use
   the ANAME/ALIAS or A-record instructions appropriate to that provider. Copy
   the current target from Render's instructions; do not guess an IP address.
   Remove conflicting AAAA records **for the hostname being connected**, as
   Render's guide requires IPv4. Preserve unrelated records, including email
   MX, SPF, DKIM and DMARC records. If you switch nameservers to Cloudflare,
   recreate/verify all existing DNS records there; buying a domain alone does
   not move DNS configuration.
4. Return to Render's **Custom Domains**, choose **Verify**, and wait for DNS
   verification and certificate issuance. Render manages TLS certificates.
   Open `https://your-domain` in a browser and confirm HTTPS works.
5. Set `AUTH_BASE_URL=https://your-domain` on **both web and worker** Render
   services. It must be the exact HTTPS origin with no path, query or credentials.
   Keep their existing matching `AUTH_SECRET`. Keep the PostgreSQL URL and TLS
   settings unchanged: a website domain is not a new database address.
6. For the recommended single-origin setup, omit `LONDOS_PWA_ORIGINS`; the
   canonical origin is already permitted. The mall is `/`, shopkeeper workspace
   is `/shopkeeper`, and landlord workspace is `/landlord` on this same domain.
   Changing that variable alone does not deploy three separate frontends.
7. Redeploy/restart both services so they load the new origin. Sign in on the new
   domain (cookies from the previous domain do not transfer). Check public shop
   pages, merchant sign-in, authorized workspace access and verification/reset
   email links. Old email links may still reference the old origin; request fresh
   links. Select one preferred domain spelling (`www` or apex) and use it
   consistently; verify any alias redirect configured by your host.

You do not need to upload admin or shopkeeper as separate sites for this setup.
Their authenticated routes are already part of the web service. A domain does
not grant access to those routes or replace application role checks.

## Enable indexing after the catalogue is ready

Add/update these **non-secret** settings in Render. Replace the illustrative
domain with your verified domain; do not copy example values as real credentials.

```dotenv
LONDOS_CORE_ENABLED=true
LONDOS_DATA_SOURCE=database
LONDOS_LOCAL_ADAPTERS=false
AUTH_BASE_URL=https://your-domain
LONDOS_SEARCH_INDEXING=true
```

Keep the existing real `DATABASE_URL`, `AUTH_SECRET` and email configuration.
Use the same canonical origin on web and worker. The indexing flag is read at
runtime; it does not require source edits. Environment templates default to
`false` so local, demonstration and staging sites are not accidentally indexed.
Fixture mode, loopback origins and invalid core settings cannot enable indexing.
Leave it disabled until fictional demonstration listings have been removed or
deliberately accepted for public exposure; it does not identify demo rows for you.

1. Restart/redeploy the web service after saving the settings.
2. Open `https://your-domain/robots.txt`. It should allow public crawling and name
   `https://your-domain/sitemap.xml`, with private paths disallowed.
3. Open that sitemap and one child sitemap. Confirm the domain and public shop
   URLs. Visit a published product and inspect its canonical URL in page source.
   `/sitemap.xml` returns 404 when indexing is disabled and 503 if catalogue
   retrieval fails; it does not report a successful empty list on database failure.
4. Add the domain to Google Search Console, follow its DNS ownership verification
   instructions, and submit `https://your-domain/sitemap.xml`. Use URL Inspection
   for an important shop/product and request indexing when available. You can
   also submit the sitemap through Bing Webmaster Tools.
5. Check Search Console for crawl/indexing errors after publication. New products
   appear automatically in subsequent eligible sitemap reads; no manual sitemap
   file editing or app rebuild is needed.

Sitemaps help discovery, but Google explicitly does **not** guarantee that all
submitted pages will be crawled/indexed. Neither ranking nor a fixed indexing
time is guaranteed. Setting the flag false blocks crawling; it is not a quick
removal tool for already indexed results. Use a search engine's removal tools
when urgent removal is necessary, and withdraw the content in Londos as well.

## Limits of this change

This enables public discovery; it does not remove the production workflow gates
listed in [Render setup](RENDER-SETUP.md). Domain purchase, real DNS/TLS changes,
Search Console submission, search-engine acceptance and real provider delivery
are operator tasks and are not proven by local tests. An owned server uses the
same canonical/indexing settings once its HTTPS ingress works; see
[self-hosting](../deploy/selfhosted/README.md) for that separate deployment path.
