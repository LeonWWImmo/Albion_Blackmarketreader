// POST /api/discord/interactions  ->  Discord interactions endpoint of the "Blackmarket Reader" bot.
// Handles the region buttons in #get-your-role: "region:eu" / "region:us" give that role and remove
// the other one, clicking your own region again removes it. Every request must carry a valid Ed25519
// signature from Discord. The bot token comes from DISCORD_BOT_TOKEN (Vercel env).
import { createPublicKey, verify } from "node:crypto";

const PUBLIC_KEY = "66829a8b5c7324ca8acf38263580002695fd2a2c92e963f42def6bd820e884b8";
const GUILD = "1459317201776677174";
const REGIONS = {
  eu: { role: "1566853201263861870", channel: "1566853435104436356", flag: "🇪🇺", name: "Europe" },
  us: { role: "1566853202404573245", channel: "1566853515840856240", flag: "🇺🇸", name: "America" }
};
const EPHEMERAL = 1 << 6;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** True when `signature` (hex) signs timestamp + body with the hex Ed25519 public key. */
export function isValidSignature(publicKeyHex, signature, timestamp, body) {
  if (!/^[0-9a-f]{128}$/i.test(signature ?? "") || !timestamp) return false;
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKeyHex, "hex")]),
    format: "der",
    type: "spki"
  });
  return verify(null, Buffer.concat([Buffer.from(timestamp), body]), key, Buffer.from(signature, "hex"));
}

async function discord(method, path) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "X-Audit-Log-Reason": "Region button" }
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
}

const reply = (content) => ({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } } });

/** Gives or removes the region role for the clicking member and says what changed. */
export async function pickRegion(region, member) {
  const pick = REGIONS[region];
  const roles = member.roles ?? [];
  const rolesPath = `/guilds/${GUILD}/members/${member.user.id}/roles`;
  if (roles.includes(pick.role)) {
    await discord("DELETE", `${rolesPath}/${pick.role}`);
    return reply(`Removed ${pick.flag} ${pick.name}. You no longer get its daily update. Click a button any time to pick again.`);
  }
  // both calls at once: Discord wants the answer within 3 seconds
  const other = Object.values(REGIONS).find((r) => r !== pick && roles.includes(r.role));
  await Promise.all([
    discord("PUT", `${rolesPath}/${pick.role}`),
    other && discord("DELETE", `${rolesPath}/${other.role}`)
  ]);
  return reply(`${pick.flag} ${other ? "Switched to" : "You picked"} ${pick.name}. Your daily update is in <#${pick.channel}>.`);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  const body = await readBody(req);
  const valid = isValidSignature(
    process.env.DISCORD_PUBLIC_KEY || PUBLIC_KEY,
    req.headers["x-signature-ed25519"],
    req.headers["x-signature-timestamp"],
    body
  );
  if (!valid) return res.status(401).send("Invalid request signature");

  const interaction = JSON.parse(body.toString("utf8"));
  if (interaction.type === 1) return res.status(200).json({ type: 1 });

  const region = /^region:(eu|us)$/.exec(interaction.data?.custom_id ?? "")?.[1];
  if (interaction.type !== 3 || !region || interaction.guild_id !== GUILD || !interaction.member) {
    return res.status(200).json(reply("This button does nothing here."));
  }
  try {
    return res.status(200).json(await pickRegion(region, interaction.member));
  } catch (err) {
    console.error("discord region button failed", err);
    return res.status(200).json(reply("Something went wrong, please check your roles and try again in a minute."));
  }
}
