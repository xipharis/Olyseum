"use client";

import { createContext, useContext } from "react";
import type { Address, Hash, Hex } from "viem";
import type { WalletSnapshot } from "@/lib/wallet-safety";
export type { WalletSnapshot } from "@/lib/wallet-safety";

type WalletSession = {
  embedded: boolean;
  configured: boolean;
  ready: boolean;
  authenticated: boolean;
  busy: boolean;
  address?: Address;
  error: string | null;
  open: () => void;
  logout: () => Promise<void>;
  getSnapshot: () => WalletSnapshot;
  /** Instant trading: the selected embedded wallet signs allowlisted calls without Privy's confirmation screen. */
  instant: boolean;
  setInstant: (on: boolean) => void;
  sendInstant?: (tx: { to: Address; data: Hex; gas: bigint }) => Promise<Hash>;
  /** Signs without Privy's screen for one flow the user has just approved in this app. Embedded wallets only. */
  sendApproved?: (tx: { to: Address; data: Hex; gas: bigint }) => Promise<Hash>;
};

// Public market reads still work when Privy has not been configured.
export const unavailableWalletSession: WalletSession = {
  embedded: false,
  configured: false,
  ready: false,
  authenticated: false,
  busy: false,
  error: null,
  open: () => {},
  logout: async () => {},
  getSnapshot: () => ({ ready: false, version: 0 }),
  instant: false,
  setInstant: () => {},
};
export const WalletSessionContext = createContext<WalletSession>(unavailableWalletSession);

export const useWalletSession = () => useContext(WalletSessionContext);
