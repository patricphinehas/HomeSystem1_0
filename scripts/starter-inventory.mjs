/**
 * The inventory a fresh database starts with: six categories, 28 items, no tags.
 *
 * This is seed data, not storage — the live inventory lives in Postgres
 * (`categories` and `items`) from the moment `pnpm seed` runs.
 */

export const STARTER_CATEGORIES = [
  {
    id: "groceries",
    name: "Groceries",
    items: [
      { id: "g1", name: "Toor dal", room: "Kitchen", qty: 2, unit: "kg", min: 1 },
      { id: "g2", name: "Basmati rice", room: "Kitchen", qty: 5, unit: "kg", min: 2 },
      { id: "g3", name: "Atta", room: "Kitchen", qty: 4, unit: "kg", min: 2 },
      { id: "g4", name: "Mustard oil", room: "Kitchen", qty: 1, unit: "L", min: 1 },
      { id: "g5", name: "Tea leaves", room: "Kitchen", qty: 0, unit: "pack", min: 1 },
      { id: "g6", name: "Sugar", room: "Kitchen", qty: 3, unit: "kg", min: 1 },
    ],
  },
  {
    id: "cleaning",
    name: "Cleaning",
    items: [
      { id: "c1", name: "Dish soap bar", room: "Kitchen", qty: 3, unit: "pc", min: 2 },
      { id: "c2", name: "Detergent powder", room: "Utility", qty: 4, unit: "kg", min: 2 },
      { id: "c3", name: "Floor cleaner", room: "Utility", qty: 2, unit: "L", min: 1 },
      { id: "c4", name: "Toilet cleaner", room: "Bathroom", qty: 1, unit: "bottle", min: 1 },
      { id: "c5", name: "Garbage bags", room: "Utility", qty: 1, unit: "roll", min: 2 },
    ],
  },
  {
    id: "bath-utilities",
    name: "Bath & utilities",
    items: [
      { id: "b1", name: "Toothpaste", room: "Bathroom", qty: 2, unit: "tube", min: 1 },
      { id: "b2", name: "Hand wash refill", room: "Bathroom", qty: 1, unit: "pc", min: 2 },
      { id: "b3", name: "Shampoo", room: "Bathroom", qty: 1, unit: "bottle", min: 1 },
      { id: "b4", name: "LED bulb 9W", room: "Living room", qty: 3, unit: "pc", min: 2 },
      { id: "b5", name: "AAA batteries", room: "Bedroom", qty: 2, unit: "pc", min: 4 },
    ],
  },
  {
    id: "games",
    name: "Games",
    items: [
      { id: "m1", name: "Carrom powder", room: "Living room", qty: 1, unit: "pack", min: 1 },
      { id: "m2", name: "Playing cards", room: "Living room", qty: 2, unit: "deck", min: 1 },
      { id: "m3", name: "Shuttlecocks", room: "Store", qty: 4, unit: "pc", min: 6 },
    ],
  },
  {
    id: "stationery",
    name: "Stationery",
    items: [
      { id: "s1", name: "A4 paper", room: "Study", qty: 1, unit: "ream", min: 1 },
      { id: "s2", name: "Ball pens", room: "Study", qty: 6, unit: "pc", min: 4 },
      { id: "s3", name: "Sticky notes", room: "Study", qty: 3, unit: "pad", min: 2 },
      { id: "s4", name: "Glue stick", room: "Study", qty: 0, unit: "pc", min: 1 },
    ],
  },
  {
    id: "wellness",
    name: "Wellness & health",
    items: [
      { id: "w1", name: "Paracetamol", room: "Bedroom", qty: 2, unit: "strip", min: 2 },
      { id: "w2", name: "Band-aids", room: "Bathroom", qty: 8, unit: "pc", min: 5 },
      { id: "w3", name: "Multivitamin", room: "Kitchen", qty: 1, unit: "bottle", min: 1 },
      { id: "w4", name: "ORS sachets", room: "Kitchen", qty: 4, unit: "pc", min: 3 },
      { id: "w5", name: "Mosquito repellent refill", room: "Bedroom", qty: 1, unit: "pc", min: 1 },
    ],
  },
];
