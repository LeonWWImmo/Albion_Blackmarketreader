/** A made-up chest log for "Try an example": two trips, three players, the game's own format. */
const rows: [string, string, string, number, number, number][] = [
  ["11/02/2026 19:02:11", "Kaelthar", "Major Healing Potion", 0, 1, -4],
  ["11/02/2026 21:14:40", "Kaelthar", "Expert's Crossbow", 1, 2, 1],
  ["11/02/2026 21:14:40", "Kaelthar", "Master's Cleric Robe", 0, 2, 1],
  ["11/02/2026 21:14:40", "Kaelthar", "Adept's Rune", 0, 1, 120],
  ["11/02/2026 21:14:40", "Kaelthar", "Expert's Soul", 0, 1, 31],
  ["11/02/2026 21:14:40", "Kaelthar", "Master's Rune", 0, 1, 22],
  ["11/02/2026 21:14:40", "Kaelthar", "Grandmaster's Rune", 0, 1, 6],
  ["11/02/2026 21:15:02", "Mirelle", "Adept's Lymhurst Cape", 2, 2, 1],
  ["11/02/2026 21:15:02", "Mirelle", "Expert's Knight Armor", 0, 3, 1],
  ["11/02/2026 21:15:02", "Mirelle", "Uncommon Heavy Hide", 1, 1, 11],
  ["11/02/2026 21:15:02", "Mirelle", "Blood Chalice", 0, 1, 2],
  ["11/02/2026 21:15:02", "Mirelle", "Ritual Candles", 0, 1, 3],
  ["11/02/2026 21:15:02", "Mirelle", "Expert's Relic", 0, 1, 13],
  ["11/02/2026 21:15:30", "Brannoc", "Master's Soldier Boots", 0, 2, 1],
  ["11/02/2026 21:15:30", "Brannoc", "Adept's Miner Workboots", 3, 3, 1],
  ["11/02/2026 21:15:30", "Brannoc", "Expert's Scholar Sandals", 2, 2, 1],
  ["11/02/2026 21:15:30", "Brannoc", "Master's Riding Horse", 0, 1, 1],
  ["11/02/2026 21:15:30", "Brannoc", "Silver Candelabrum", 0, 1, 2],
  ["11/03/2026 20:40:12", "Mirelle", "Master's Crossbow", 0, 2, 1],
  ["11/03/2026 20:40:12", "Mirelle", "Expert's Fiend Cowl", 1, 2, 1],
  ["11/03/2026 20:40:12", "Mirelle", "Adept's Soul", 0, 1, 35],
  ["11/03/2026 20:40:12", "Mirelle", "Expert's Rune", 0, 1, 105],
  ["11/03/2026 20:40:12", "Brannoc", "Adept's Bag", 1, 4, 1],
  ["11/03/2026 20:40:12", "Brannoc", "Expert's Mercenary Jacket", 2, 2, 1],
  ["11/03/2026 20:40:12", "Brannoc", "Gigantify Potion", 0, 1, 3]
];

export const EXAMPLE_LOG = [
  '"Date"\t"Player"\t"Item"\t"Enchantment"\t"Quality"\t"Amount"',
  ...rows.map((r) => r.map((c) => `"${c}"`).join("\t"))
].join("\n");
