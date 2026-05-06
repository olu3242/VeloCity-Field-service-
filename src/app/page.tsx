import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OriginalLandingPage } from "@/components/landing/original-landing-page";

function extractFirstMatch(source: string, pattern: RegExp) {
  return source.match(pattern)?.[1] ?? "";
}

function mapLandingLinks(markup: string) {
  let nextBookHref = 0;
  let nextProviderHref = 0;
  return markup.replace(/href="#"/g, () => {
    nextBookHref += 1;
    if (nextBookHref === 1) return 'href="/"';
    if (nextBookHref === 2) return 'href="/auth/login"';
    if (nextBookHref === 3) return 'href="/book"';
    if (nextBookHref === 4) return 'href="/book"';
    nextProviderHref += 1;
    if (nextProviderHref === 1) return 'href="/provider/apply"';
    return 'href="/"';
  });
}

export default async function HomePage() {
  const landingHtml = await readFile(
    join(process.cwd(), "Landing page HTML for VeloCity Field Service"),
    "utf8"
  );
  const styles = extractFirstMatch(landingHtml, /<style>([\s\S]*?)<\/style>/i);
  const body = extractFirstMatch(landingHtml, /<body[^>]*>([\s\S]*?)<\/body>/i)
    .replace(/<script>[\s\S]*?<\/script>/i, "");

  return (
    <OriginalLandingPage
      styles={`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=Space+Mono:wght@400;700&display=swap');\n${styles}`}
      bodyHtml={mapLandingLinks(body)}
    />
  );
}
