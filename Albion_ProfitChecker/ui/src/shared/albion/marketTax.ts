/**
 * Albion's market taxes. Every sale pays the sales tax, 4% with Premium and 8% without; selling
 * through a sell order also pays the 2.5% setup fee when the order is listed. Selling instantly
 * (to a buy order or the Black Market) pays only the sales tax.
 */
export const SETUP_FEE_RATE = 0.025;

export const salesTaxRate = (premium: boolean): number => (premium ? 0.04 : 0.08);
