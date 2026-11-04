import { deploymentManifests, markets } from "@/config/deployment";

const lower = (v: unknown) => typeof v === "string" ? v.toLowerCase() : "";
const engines = new Set(markets.map((m) => m.engine.toLowerCase()));
const vaults = new Set(deploymentManifests.map((m) => m.contracts.CollateralVault.address.toLowerCase()));
const tokens = new Set(deploymentManifests.map((m) => m.contracts.CollateralToken.address.toLowerCase()));

/**
 * Calls an embedded wallet may sign without Privy's confirmation screen: trading on verified markets and
 * moving the owner's own collateral toward them. Withdrawals, releases, reserve deposits, transfers and
 * any other target still ask for confirmation.
 */
export function instantAllowed(call: { address: string; functionName: string; args?: readonly unknown[] }) {
  const to = call.address.toLowerCase(), args = call.args ?? [];
  switch (call.functionName) {
    case "placeOrder": case "cancel": case "cancelAll": return engines.has(to);
    case "deposit": return vaults.has(to);
    case "allocate": return vaults.has(to) && engines.has(lower(args[0])) && args[2] === false;
    case "approve": return tokens.has(to) && vaults.has(lower(args[0]));
    default: return false;
  }
}
