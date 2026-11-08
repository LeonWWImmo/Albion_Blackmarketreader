import type { SyntheticEvent } from "react";
import { assetUrl } from "../../../shared/assets/assets";

const PLACEHOLDER = assetUrl("picture/item-unknown.svg");

/** Albion's image server has no picture for a few tradable items: show a plain item box, not a broken image. */
export function onIconError(event: SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget;
  if (img.src.endsWith(PLACEHOLDER)) return;
  img.src = PLACEHOLDER;
}
