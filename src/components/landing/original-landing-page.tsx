"use client";

import { useEffect } from "react";

export function OriginalLandingPage({
  styles,
  bodyHtml,
}: {
  styles: string;
  bodyHtml: string;
}) {
  useEffect(() => {
    const chips = Array.from(document.querySelectorAll<HTMLElement>(".cat-chip"));
    const onChipClick = (event: Event) => {
      chips.forEach((chip) => chip.classList.remove("active"));
      (event.currentTarget as HTMLElement).classList.add("active");
    };
    chips.forEach((chip) => chip.addEventListener("click", onChipClick));

    const animated = Array.from(
      document.querySelectorAll<HTMLElement>(".service-card, .why-card, .agent-item, .step-item")
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            target.style.opacity = "1";
            target.style.transform = "translateY(0)";
          }
        });
      },
      { threshold: 0.1 }
    );

    animated.forEach((element) => {
      element.style.opacity = "0";
      element.style.transform = "translateY(20px)";
      element.style.transition = "opacity 0.5s ease, transform 0.5s ease";
      observer.observe(element);
    });

    return () => {
      chips.forEach((chip) => chip.removeEventListener("click", onChipClick));
      observer.disconnect();
    };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </>
  );
}
