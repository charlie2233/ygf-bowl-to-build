"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RefObject } from "react";

import type { CampaignLocale } from "@/lib/i18n/campaign";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const mobilePhoneRotation = 2;

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);

  if (typeof window.matchMedia === "function") {
    gsap.registerPlugin(ScrollTrigger);
  }
}

type MotionConditions = Readonly<{
  canHover: boolean;
  isDesktop: boolean;
  isMobile: boolean;
  reduceMotion: boolean;
}>;

function supportsCampaignMotionRuntime() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    typeof window.requestAnimationFrame === "function"
  );
}

function getRevealChildren(element: HTMLElement) {
  if (element.matches(".use-cases")) {
    return element.querySelectorAll<HTMLElement>(".use-cases h2, .use-case");
  }

  if (element.matches(".how-it-works__lead")) {
    return element.querySelectorAll<HTMLElement>(
      ":scope > div:first-child, .how-it-works__photo",
    );
  }

  if (element.matches(".campaign-steps-wrap")) {
    return element.querySelectorAll<HTMLElement>(".campaign-step");
  }

  if (element.matches(".campaign-handoff")) {
    return element.querySelectorAll<HTMLElement>("p, a");
  }

  if (element.matches(".busy-week__inner")) {
    return element.querySelectorAll<HTMLElement>(
      ":scope > div, .busy-week__illustration",
    );
  }

  return element.querySelectorAll<HTMLElement>(".section-heading");
}

export function useCampaignMotionExperience({
  locale,
  scopeRef,
}: Readonly<{
  locale: CampaignLocale;
  scopeRef: RefObject<HTMLDivElement | null>;
}>) {
  useGSAP(
    (_context, contextSafe) => {
      if (!supportsCampaignMotionRuntime()) {
        return;
      }

      const scope = scopeRef.current;

      if (!scope) {
        return;
      }

      const documentRoot = document.documentElement;
      const hero = scope.querySelector<HTMLElement>("[data-motion-hero]");
      const heroImage = scope.querySelector<HTMLElement>(
        ".marketing-hero__image",
      );
      const heroHeadlineLines = scope.querySelectorAll<HTMLElement>(
        "[data-motion-hero-copy] h1 span",
      );
      const heroSubhead = scope.querySelector<HTMLElement>(
        ".marketing-hero__subhead",
      );
      const heroGuidance = scope.querySelector<HTMLElement>(
        ".marketing-hero__guidance",
      );
      const heroActions = scope.querySelectorAll<HTMLElement>(
        ".marketing-hero__actions a",
      );
      const heroRewardNote = scope.querySelector<HTMLElement>(
        ".marketing-hero__reward-note",
      );
      const heroDisclaimer = scope.querySelector<HTMLElement>(
        ".marketing-hero__disclaimer",
      );
      const phone = scope.querySelector<HTMLElement>("[data-motion-phone]");
      const phoneSections = scope.querySelectorAll<HTMLElement>(
        ".campaign-phone__receipt, .campaign-phone__wallet",
      );
      const compositorTargets = [heroImage, phone].filter(
        (element): element is HTMLElement => element !== null,
      );
      const matchMedia = gsap.matchMedia();
      documentRoot.dataset.campaignMotionEngine = "gsap";
      scope.dataset.motionEngine = "gsap";

      matchMedia.add(
        {
          canHover: "(hover: hover) and (pointer: fine)",
          isDesktop: "(min-width: 821px)",
          isMobile: "(max-width: 820px)",
          reduceMotion: reducedMotionQuery,
        },
        (mediaContext) => {
          const {
            canHover,
            isDesktop,
            isMobile,
            reduceMotion,
          } = mediaContext.conditions as MotionConditions;

          documentRoot.dataset.campaignMotion = reduceMotion
            ? "reduced"
            : "enhanced";

          if (reduceMotion) {
            if (heroImage) {
              gsap.set(heroImage, {
                clearProps: "transform,willChange",
              });
            }
            gsap.set(
              [
                ...heroHeadlineLines,
                heroSubhead,
                heroGuidance,
                ...heroActions,
                heroRewardNote,
                heroDisclaimer,
                phone,
                ...phoneSections,
              ].filter(Boolean),
              {
                clearProps: "all",
              },
            );
            return;
          }

          gsap.set(compositorTargets, {
            willChange: "transform",
          });
          gsap.set(heroImage, {
            scale: 1.07,
          });
          gsap.set(heroHeadlineLines, {
            y: isMobile ? 22 : 34,
          });
          gsap.set(heroSubhead, {
            y: 18,
          });
          gsap.set(heroGuidance, {
            y: 14,
          });
          gsap.set(heroActions, {
            y: 16,
          });
          gsap.set(heroRewardNote, {
            y: 12,
          });
          gsap.set(heroDisclaimer, {
            y: 10,
          });
          gsap.set(phone, {
            rotationX: isDesktop ? 7 : 0,
            rotationY: isDesktop ? -7 : 0,
            rotationZ: isDesktop ? 11 : mobilePhoneRotation,
            scale: 0.94,
            transformPerspective: 1000,
            y: 20,
          });
          gsap.set(phoneSections, {
            y: 12,
          });

          const heroTimeline = gsap.timeline({
            defaults: {
              duration: isMobile ? 0.55 : 0.72,
              ease: "power3.out",
            },
          });

          heroTimeline
            .addLabel("intro", 0)
            .to(
              heroImage,
              {
                duration: 1.4,
                scale: 1.035,
              },
              "intro",
            )
            .to(
              heroHeadlineLines,
              {
                stagger: 0.08,
                y: 0,
              },
              "intro+=0.05",
            )
            .to(
              heroSubhead,
              {
                y: 0,
              },
              "intro+=0.19",
            )
            .to(
              heroGuidance,
              {
                y: 0,
              },
              "intro+=0.25",
            )
            .to(
              heroActions,
              {
                stagger: 0.08,
                y: 0,
              },
              "intro+=0.3",
            )
            .to(
              heroRewardNote,
              {
                y: 0,
              },
              "intro+=0.42",
            )
            .to(
              heroDisclaimer,
              {
                y: 0,
              },
              "intro+=0.49",
            )
            .to(
              phone,
              {
                duration: isMobile ? 0.68 : 0.86,
                rotationX: 0,
                rotationY: 0,
                rotationZ: isDesktop ? 8 : mobilePhoneRotation,
                scale: 1,
                transformPerspective: 1000,
                y: 0,
              },
              "intro+=0.1",
            )
            .to(
              phoneSections,
              {
                stagger: 0.1,
                y: 0,
              },
              "intro+=0.33",
            )
            .set(
              compositorTargets,
              {
                clearProps: "willChange",
              },
              "intro+=1.4",
            );

          if (
            !canHover ||
            !isDesktop ||
            !hero ||
            !heroImage ||
            !phone ||
            !contextSafe
          ) {
            return;
          }

          const moveImageX = gsap.quickTo(heroImage, "x", {
            duration: 0.55,
            ease: "power3.out",
          });
          const moveImageY = gsap.quickTo(heroImage, "y", {
            duration: 0.55,
            ease: "power3.out",
          });
          const rotatePhoneX = gsap.quickTo(phone, "rotationX", {
            duration: 0.5,
            ease: "power3.out",
          });
          const rotatePhoneY = gsap.quickTo(phone, "rotationY", {
            duration: 0.5,
            ease: "power3.out",
          });

          const handlePointerMove = contextSafe((event: PointerEvent) => {
            const bounds = hero.getBoundingClientRect();
            const x = gsap.utils.clamp(
              -1,
              1,
              ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
            );
            const y = gsap.utils.clamp(
              -1,
              1,
              ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
            );

            moveImageX(x * -10);
            moveImageY(y * -7);
            rotatePhoneX(y * -3.5);
            rotatePhoneY(x * 4.5);
          });

          const resetPointerMotion = contextSafe(() => {
            moveImageX(0);
            moveImageY(0);
            rotatePhoneX(0);
            rotatePhoneY(0);
          });

          hero.addEventListener("pointermove", handlePointerMove);
          hero.addEventListener("pointerleave", resetPointerMotion);

          return () => {
            hero.removeEventListener("pointermove", handlePointerMove);
            hero.removeEventListener("pointerleave", resetPointerMotion);
          };
        },
        scope,
      );

      return () => {
        matchMedia.revert();
        delete documentRoot.dataset.campaignMotion;
        delete documentRoot.dataset.campaignMotionEngine;
        delete scope.dataset.motionEngine;
      };
    },
    {
      scope: scopeRef,
    },
  );

  useGSAP(
    () => {
      if (!supportsCampaignMotionRuntime()) {
        return;
      }

      const scope = scopeRef.current;

      if (!scope) {
        return;
      }

      const revealElements = gsap.utils.toArray<HTMLElement>(
        "[data-motion-reveal]",
        scope,
      );
      const journey = scope.querySelector<HTMLElement>(
        "[data-motion-journey]",
      );
      const journeyProgress = journey?.querySelector<HTMLElement>(
        "[data-motion-journey-progress]",
      );
      const matchMedia = gsap.matchMedia();
      let refreshFrame = 0;

      delete scope.dataset.motionReady;

      matchMedia.add(
        {
          isDesktop: "(min-width: 641px)",
          isMobile: "(max-width: 640px)",
          reduceMotion: reducedMotionQuery,
        },
        (mediaContext) => {
          const { isMobile, reduceMotion } =
            mediaContext.conditions as MotionConditions;
          const revealChildren = revealElements.flatMap((element) =>
            Array.from(getRevealChildren(element)),
          );

          if (reduceMotion) {
            gsap.set([...revealElements, ...revealChildren], {
              clearProps: "all",
            });
            if (journeyProgress) {
              gsap.set(journeyProgress, {
                clearProps: "all",
              });
            }
          } else {
            revealElements.forEach((element) => {
              const children = Array.from(getRevealChildren(element));

              gsap.set(element, {
                y: isMobile ? 18 : 30,
              });
              gsap.set(children, {
                y: isMobile ? 10 : 18,
              });

              const revealTimeline = gsap.timeline({
                scrollTrigger: {
                  invalidateOnRefresh: true,
                  markers: false,
                  once: true,
                  start: "clamp(top 86%)",
                  trigger: element,
                },
              });

              revealTimeline.to(element, {
                duration: isMobile ? 0.5 : 0.68,
                ease: "power3.out",
                y: 0,
              });

              if (children.length > 0) {
                revealTimeline.to(
                  children,
                  {
                    duration: isMobile ? 0.42 : 0.56,
                    ease: "power2.out",
                    stagger: isMobile ? 0.04 : 0.07,
                    y: 0,
                  },
                  "<0.08",
                );
              }
            });

            if (journey && journeyProgress) {
              gsap.set(journeyProgress, {
                scaleX: isMobile ? 1 : 0,
                scaleY: isMobile ? 0 : 1,
                transformOrigin: isMobile ? "center top" : "left center",
              });

              const journeyTimeline = gsap.timeline({
                scrollTrigger: {
                  end: "clamp(bottom 44%)",
                  invalidateOnRefresh: true,
                  markers: false,
                  scrub: isMobile ? 0.25 : 0.35,
                  start: "clamp(top 84%)",
                  trigger: journey,
                },
              });

              journeyTimeline.to(
                journeyProgress,
                {
                  duration: 1,
                  ease: "none",
                  scaleX: 1,
                  scaleY: 1,
                },
                0,
              );
            }
          }

          refreshFrame = window.requestAnimationFrame(() => {
            ScrollTrigger.refresh();
            scope.dataset.motionReady = "true";
          });

          return () => {
            window.cancelAnimationFrame(refreshFrame);
            delete scope.dataset.motionReady;
          };
        },
        scope,
      );

      return () => {
        window.cancelAnimationFrame(refreshFrame);
        matchMedia.revert();
        delete scope.dataset.motionReady;
      };
    },
    {
      dependencies: [locale],
      revertOnUpdate: true,
      scope: scopeRef,
    },
  );

}
