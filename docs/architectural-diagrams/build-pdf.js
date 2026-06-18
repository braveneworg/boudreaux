// Build a landscape, grayscale PDF from the Mermaid diagram sources.
// Reads every .mmd in ./diagrams, emits one diagram per landscape page,
// then prints to PDF via headless Chrome. No npm deps; Mermaid loads from CDN.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const diagramsDir = join(here, 'diagrams');

// Page title per file (kept in sync with the documentation TOC).
const titles = new Map([
  ['01-frontend-architecture.mmd', '1. Frontend Architecture'],
  ['02-backend-architecture.mmd', '2. Backend Architecture (Layered)'],
  ['03-integrations-infrastructure.mmd', '3. Integrations & Infrastructure'],
  ['04-data-model-catalog-commerce.mmd', '4. Data Model — Catalog & Commerce'],
  ['05-data-model-events-community.mmd', '5. Data Model — Events & Community'],
  ['06-sequence-purchase-checkout.mmd', '6. Sequence — PWYW Checkout & Webhook'],
  ['07-sequence-download-authorization.mmd', '7. Sequence — Download Authorization'],
  ['08-sequence-magic-link-auth.mmd', '8. Sequence — Magic-Link Authentication'],
  ['09-sequence-chat-message.mmd', '9. Sequence — Live Chat Message'],
  ['10-workflow-fan-journey.mmd', '10. User Workflow — Fan Journey'],
  ['11-workflow-admin-management.mmd', '11. User Workflow — Admin Management'],
]);

const files = readdirSync(diagramsDir)
  .filter((f) => f.endsWith('.mmd'))
  .sort();

const pages = files
  .map((f) => {
    const src = readFileSync(join(diagramsDir, f), 'utf8');
    const title = titles.get(f) ?? f;
    // <pre class="mermaid"> preserves whitespace; Mermaid reads textContent.
    return `<section class="page">
      <h2>${title}</h2>
      <div class="diagram"><pre class="mermaid">${src
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</pre></div>
    </section>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>boudreaux — Architecture Diagrams</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<style>
  @page { size: 11.69in 8.27in; margin: 0.35in; } /* A4 landscape */
  html, body { margin: 0; padding: 0; background: #ffffff; color: #000000;
    font-family: Helvetica, Arial, sans-serif; }
  .page {
    box-sizing: border-box;
    width: 100%;
    height: 7.4in;            /* fits inside A4-landscape printable area */
    page-break-after: always;
    display: flex; flex-direction: column;
    align-items: center;
  }
  .page:last-of-type { page-break-after: auto; }
  h2 { font-size: 22px; font-weight: 700; margin: 0 0 8px 0;
    border-bottom: 2px solid #000; width: 100%; padding-bottom: 6px; }
  .diagram { flex: 1; width: 100%; display: flex;
    align-items: center; justify-content: center; overflow: hidden; }
  .mermaid { width: 100%; display: flex; justify-content: center; }
  /* Force rendered SVG to fit the page without shrinking text below ~10px. */
  .mermaid svg { max-width: 100% !important; max-height: 6.7in !important;
    height: auto !important; }
</style>
</head>
<body>
${pages}
<script>
  mermaid.initialize({
    startOnLoad: true,
    securityLevel: 'loose',
    theme: 'base',
    themeVariables: {
      background: '#ffffff',
      primaryColor: '#ffffff',
      primaryBorderColor: '#000000',
      primaryTextColor: '#000000',
      secondaryColor: '#e6e6e6',
      tertiaryColor: '#f0f0f0',
      lineColor: '#000000',
      textColor: '#000000',
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontSize: '18px',
      clusterBkg: '#f0f0f0',
      clusterBorder: '#000000',
      nodeBorder: '#000000',
      mainBkg: '#ffffff',
      edgeLabelBackground: '#ffffff',
      actorBkg: '#ffffff', actorBorder: '#000000', actorTextColor: '#000000',
      signalColor: '#000000', signalTextColor: '#000000',
      labelBoxBkgColor: '#e6e6e6', labelBoxBorderColor: '#000000', labelTextColor: '#000000',
      loopTextColor: '#000000',
      noteBkgColor: '#e6e6e6', noteTextColor: '#000000', noteBorderColor: '#000000',
      activationBkgColor: '#cccccc', activationBorderColor: '#000000',
      sequenceNumberColor: '#ffffff',
      altBackground: '#f7f7f7'
    },
    flowchart: { htmlLabels: true, curve: 'basis', nodeSpacing: 45, rankSpacing: 55 },
    er: { fontSize: 16 }
  });
  // Signal Chrome that rendering is finished.
  window.__renderDone = false;
  mermaid.run().then(() => { window.__renderDone = true; document.title = 'READY'; });
</script>
</body>
</html>`;

writeFileSync(join(here, 'architecture-diagrams.html'), html);
console.info('Wrote architecture-diagrams.html with', files.length, 'diagrams');
