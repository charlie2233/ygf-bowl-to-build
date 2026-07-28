"use client";

import { useEffect } from "react";

import type { CampaignLocale } from "@/lib/i18n/campaign";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function safelyAnimate(
  element: Element | null,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
) {
  if (!(element instanceof HTMLElement) || !element.animate) {
    return null;
  }

  return element.animate(keyframes, options);
}

export function CampaignMotionExperience({
  locale,
}: Readonly<{
  locale: CampaignLocale;
}>) {
  useEffect(() => {
    const root = document.documentElement;
    const hero = document.querySelector<HTMLElement>("[data-motion-hero]");
    const heroCopy = document.querySelector("[data-motion-hero-copy]");
    const phone = document.querySelector("[data-motion-phone]");
    const revealElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-motion-reveal]"),
    );
    const reduceMotion = window.matchMedia(reducedMotionQuery).matches;

    root.dataset.campaignMotion = reduceMotion ? "reduced" : "enhanced";

    if (reduceMotion) {
      revealElements.forEach((element) => {
        element.dataset.motionState = "visible";
      });
      return;
    }

    const animations = [
      safelyAnimate(
        heroCopy,
        [
          { opacity: 0, transform: "translate3d(0, 24px, 0)" },
          { opacity: 1, transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: 680,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "backwards",
        },
      ),
      safelyAnimate(
        phone,
        [
          {
            opacity: 0,
            transform:
              "perspective(1000px) rotateZ(8deg) rotateX(8deg) rotateY(-8deg) translate3d(20px, 18px, 0) scale(0.94)",
          },
          {
            opacity: 1,
            transform:
              "perspective(1000px) rotateZ(8deg) rotateX(0deg) rotateY(0deg) translate3d(0, 0, 0) scale(1)",
          },
        ],
        {
          delay: 120,
          duration: 820,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "backwards",
        },
      ),
    ].filter((animation): animation is Animation => animation !== null);

    revealElements.forEach((element) => {
      element.dataset.motionState = "pending";
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          const element = entry.target as HTMLElement;
          element.dataset.motionState = "visible";
          observer.unobserve(element);
        });
      },
      {
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.12,
      },
    );

    revealElements.forEach((element) => observer.observe(element));

    let animationFrame = 0;

    const setHeroMotion = (clientX: number, clientY: number) => {
      if (!hero) {
        return;
      }

      const bounds = hero.getBoundingClientRect();
      const x = Math.max(
        -1,
        Math.min(1, ((clientX - bounds.left) / bounds.width - 0.5) * 2),
      );
      const y = Math.max(
        -1,
        Math.min(1, ((clientY - bounds.top) / bounds.height - 0.5) * 2),
      );

      hero.style.setProperty("--hero-shift-x", `${x * -10}px`);
      hero.style.setProperty("--hero-shift-y", `${y * -7}px`);
      hero.style.setProperty("--phone-tilt-x", `${y * -3.5}deg`);
      hero.style.setProperty("--phone-tilt-y", `${x * 4.5}deg`);
    };

    const handlePointerMove = (event: PointerEvent) => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        setHeroMotion(event.clientX, event.clientY);
      });
    };

    const resetHeroMotion = () => {
      window.cancelAnimationFrame(animationFrame);
      if (!hero) {
        return;
      }

      hero.style.setProperty("--hero-shift-x", "0px");
      hero.style.setProperty("--hero-shift-y", "0px");
      hero.style.setProperty("--phone-tilt-x", "0deg");
      hero.style.setProperty("--phone-tilt-y", "0deg");
    };

    if (hero && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      hero.addEventListener("pointermove", handlePointerMove);
      hero.addEventListener("pointerleave", resetHeroMotion);
    }

    return () => {
      animations.forEach((animation) => animation.cancel());
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
      hero?.removeEventListener("pointermove", handlePointerMove);
      hero?.removeEventListener("pointerleave", resetHeroMotion);
    };
  }, [locale]);

  return null;
}
