# Image Strategy

## Finding: there are no bundled image assets in this codebase

A direct search of `src/` and `public/` found zero image files anywhere in the repository. `public/` does not exist as a directory at all. The only images that ever render in this app are dynamic, user-uploaded job photos stored in Supabase storage at runtime — there is no marketing photography, no product screenshots, no team photos, no logos as image files.

This means the "eliminate holograms/glowing robots/futuristic cities/floating cubes/AI fantasy artwork" instruction is already satisfied by default — that imagery was never added. The landing page's only visual decoration is CSS:

| Class | Purpose |
|---|---|
| `.hero-bg-glow` | Soft radial gradient glow behind the hero, no imagery |
| `.float-card`, `.float-card-1`, `.float-card-2` | The "en route" / "job completed" mockup cards in the hero |
| `.float-avatar` | A two-letter initials avatar (e.g. "JT"), not a photo |
| `.float-dot` | A small status-indicator dot |
| `landing-float1` / `landing-float2` keyframes | Subtle floating animation on the above elements |

None of this is decorative tech-fantasy artwork — it's UI-mockup decoration (status cards, an avatar initial) consistent with showing the product in a believable, grounded way rather than abstract visuals.

## What this means for the directive's image-strategy requirement

I cannot generate or source real photography, product screenshots, or team/provider photos in this pass — doing so would mean either fabricating stock imagery (which risks looking exactly like the generic AI-stock-photo problem the spec is trying to avoid) or downloading third-party images without a licensing decision the user hasn't made. That's a content/asset decision, not a code change, and is outside what an "implementation safety" quick-win pass should do unilaterally.

## Recommendation (not implemented this pass)

1. **Highest-value real asset**: actual product screenshots (e.g. the customer job-tracking view, the provider offer-acceptance flow) used in the hero or a "How It Works" visual — these would be authentic, on-brand, and directly support the spec's 70/30 visual-first target without any stock-photo risk.
2. **Second priority**: real verified-provider photos (with consent) for the testimonials/trust sections, replacing the current initials-avatar placeholder.
3. **Do not** add generic stock photography of "happy customers" or "technicians" sourced from an image library — it reads as filler and undermines the trust-architecture goals this sprint is also pursuing.
4. Until real assets are sourced, the current CSS-only decoration is the right interim choice — it is honest about being UI, not a fake screenshot, and carries zero risk of looking AI-generated.

This is flagged as a follow-up requiring an explicit content decision from the user (what to photograph, whose consent is needed, what budget exists for photography), not something to resolve via code in this pass.
