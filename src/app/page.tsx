import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OriginalLandingPage } from "@/components/landing/original-landing-page";

function extractFirstMatch(source: string, pattern: RegExp) {
  return source.match(pattern)?.[1] ?? "";
}

function mapLandingLinks(markup: string) {
  const linkTargets: Record<string, string> = {
    velocity: "/",
    "sign in": "/auth/login",
    "book service": "/book",
    "book your first service": "/book",
    "become a provider": "/provider/apply",
    "home services": "/services",
    providers: "/providers",
    "service areas": "/service-areas",
    community: "/community",
    pricing: "/pricing",
    "provider dashboard": "/provider/dashboard",
    "business solutions": "/business-solutions",
    "territory operators": "/territory-operators",
    "alice intake": "/ai/alice",
    "max dispatch": "/ai/max",
    "quinn quotes": "/ai/quinn",
    "rex quality": "/ai/rex",
    "help center": "/support",
    "contact us": "/support#contact",
    "terms of service": "/terms",
    "privacy policy": "/privacy",
  };

  return markup.replace(
    /<a href="#"([^>]*)>([\s\S]*?)<\/a>/g,
    (anchor, attributes: string, content: string) => {
      const label = content
        .replace(/<[^>]+>/g, "")
        .replace(/[→⚡]/g, "")
        .replace(/[—–-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const href = linkTargets[label] ?? "/";

      return `<a href="${href}"${attributes}>${content}</a>`;
    }
  );
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
