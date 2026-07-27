/**
 * This context is intentionally category-level. The campaign does not own a
 * verified live restaurant menu, so it must never present availability,
 * ingredients, allergens, or prices as current facts.
 */
export const MENU_SAFETY_NOTICE =
  "Food suggestions are informational only. Please confirm ingredients/allergens with YGF staff.";

export const MENU_AVAILABILITY_NOTICE =
  "YGF selections, availability and prices change. Confirm current ingredients, portions, and prices with staff before ordering.";

const MENU_CATEGORIES = [
  "protein or plant-protein options",
  "leafy vegetables and mushrooms",
  "tofu and soy-based options",
  "noodles or other starches",
  "broth and spice-level preferences",
] as const;

export function menuContextForProvider() {
  return [
    "Offer a flexible bowl framework using only general categories:",
    ...MENU_CATEGORIES.map((category) => `- ${category}`),
    "Do not claim an item is currently stocked, quote or calculate a current price, or guarantee an ingredient or allergen profile.",
    MENU_AVAILABILITY_NOTICE,
    MENU_SAFETY_NOTICE,
  ].join("\n");
}
