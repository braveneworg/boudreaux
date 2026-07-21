# next/dynamic server-renders only its loading fallback

In the App Router, `next/dynamic` server-renders only its `loading` fallback —
never the component — even with ssr:true (verified empirically on the webpack
prod standalone). When markup must be in the server HTML (LCP elements, SEO
content), use a static import and code-split the heavy leaf deeper instead.
