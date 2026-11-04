import Link from "next/link";
import { explorerAddress } from "@/config/chain";
import { markets, publicManifest } from "@/config/deployment";
import { Note, Table, type DocGroup } from "./kit";

const CONTRACT_ROLES: Record<string, string> = {
  CollateralVault: "Holds every trader's collateral; deposits, allocations, releases, withdrawals and claims",
  CollateralToken: "tUSDC, the test collateral (6 decimals)",
  TestUSDC: "The test token contract behind tUSDC, with its faucet",
  MarketFactory: "Deploys new market engines",
  MarketRegistry: "The list of markets: questions, rules and resolution settings",
  EngineCodeStore: "Stores engine code so each market fits Monad's contract size limit",
  EngineCodeStoreTail: "Second half of the engine code store",
  ResolutionOracle: "Runs each market's resolution and is the only contract that can halt or settle a market",
  UmaAdapter: "Posts proposals as bonded assertions and reads their results",
  OptimisticOracleV3: "UMA's optimistic oracle, where proposals can be disputed",
  ErosSandboxOracle: "Testnet stand-in for UMA's voters; disputes are decided by the Osyleum team",
  BondTreasury: "Holds bonds and rewards for the oracle; never funded from a market reserve",
  KeeperRouter: "Lets keepers finalize many markets in one transaction",
  RolloverBatcher: "Helps keepers run hourly epoch updates",
  Timelock: "Delays admin changes to the oracle",
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const Addr = ({ a }: { a: string }) => <a href={explorerAddress(a)} target="_blank" rel="noreferrer" title={a} className="tnum">{short(a)} ↗</a>;

export const reference: DocGroup = {
  title: "Reference",
  pages: [
    {
      slug: "units",
      title: "Units",
      summary: "Protocol units, integer arithmetic and numeric limits.",
      sections: [
        { id: "units", title: "Units", body: <Table rows={[
          ["Unit", "Size", "Used for"],
          ["Claim", "Pays 1 tUSDC on YES, 0 on NO", "Position sizes"],
          ["Lot", "0.001 claim", "Minimum order and position increment"],
          ["Tick", "0.001 of price, from 1 (0.001) to 999 (0.999)", "Prices"],
          ["Atom", "0.000001 tUSDC (6 decimals)", "Deposits and withdrawals"],
          ["Q", "One atom × 10¹⁸", "Internal cash inside a market"],
        ]} /> },
        { id: "maths", title: "Arithmetic", body: <>
          <p>All amounts are integers; no floating-point arithmetic is used. A fill of L lots at tick t moves exactly L × t atoms of cash between the two sides, and one lot pays exactly 1,000 atoms (0.001 tUSDC) if YES wins.</p>
          <p>Internal cash is tracked in Q, 10¹⁸ times finer than an atom, to preserve precision in funding and premium. Fractional remainders are never rounded up into withdrawable collateral, and all risk calculations round against the trader.</p>
        </> },
        { id: "limits", title: "Limits", body: <ul>
          <li>Prices: 0.001 to 0.999, in steps of 0.001.</li>
          <li>Position size: up to 2⁴⁰ lots.</li>
          <li>Order book: 999 price levels with first-in-first-out priority and a bounded number of fills per order.</li>
          <li>Each market has a maximum number of participating accounts.</li>
        </ul> },
        { id: "formatting", title: "Display conventions", body: <ul>
          <li>Values are read at a specific block; values displayed together share a block.</li>
          <li>Numbers use tabular figures.</li>
          <li>Unavailable values are shown with a reason, never as zero.</li>
          <li>Kuru spot prices are displayed in cents (56.3¢ = 0.563).</li>
        </ul> },
      ],
    },
    {
      slug: "contracts",
      title: "Contracts and addresses",
      summary: "Deployed contracts on Monad testnet, read from the verified deployment manifest.",
      sections: [
        { id: "network", title: "Network", body: <Table rows={[
          ["", ""],
          ["Network", "Monad testnet"],
          ["Chain ID", String(publicManifest.chainId)],
          ["Verified at block", publicManifest.verifiedAt.blockNumber],
          ["Explorer", <a key="x" href="https://testnet.monadscan.com" target="_blank" rel="noreferrer">testnet.monadscan.com ↗</a>],
        ]} /> },
        { id: "markets", title: "Market engines", body: <>
          <p>Each market is a single engine contract containing its order book and risk engine.</p>
          <Table rows={[
            ["Market", "Engine", "Source", "Status"],
            ...markets.map((m) => [m.title, <Addr key={m.engine} a={m.engine} />, m.source ?? "Polymarket", m.archived ? "Archived" : <Link key="o" href={`/m/${m.engine}`}>Open ↗</Link>]),
          ]} />
        </> },
        { id: "core", title: "Core contracts", body: <Table rows={[
          ["Contract", "Address", "What it does"],
          ...Object.entries(publicManifest.contracts as Record<string, { address: string }>)
            .filter(([name]) => CONTRACT_ROLES[name])
            .map(([name, c]) => [name, <Addr key={name} a={c.address} />, CONTRACT_ROLES[name]]),
        ]} /> },
        { id: "verify", title: "Verification", body: <Note>
          <p>The interface verifies the chain ID, contract code hashes and factory, vault and oracle bindings before reading or writing, and does not build transactions for markets outside the verified manifest.</p>
          <p>Compare the contract address in the wallet confirmation with the addresses listed on this page.</p>
        </Note> },
      ],
    },
    {
      slug: "glossary",
      title: "Glossary",
      summary: "Definitions of terms used throughout the protocol and interface.",
      sections: [
        { id: "terms", title: "Terms", body: <Table rows={[
          ["Term", "Meaning"],
          ["Allocate", "Assignment of free vault collateral to a market"],
          ["Bootstrap", "Initial pricing mode without a mark; only fully backed orders within the index band"],
          ["Claim", "Unit of exposure; pays 1 tUSDC on YES and 0 on NO"],
          ["Claims ready", "Settlement phase in which payouts are claimable"],
          ["Deficit", "Negative account value under an outcome; covered by the reserve"],
          ["Equity", "Cash plus the position valued at the mark"],
          ["Epoch", "One-hour accounting period for funding and premium"],
          ["Fully backed", "Account value is non-negative under both YES and NO"],
          ["Funding", "Periodic payment between longs and shorts that aligns the mark with the index"],
          ["Grace", "One-hour period to restore an account below initial margin"],
          ["Halt", "End of trading, at T or on an early halt"],
          ["Index", "300-second TWAP of the external reference price"],
          ["Initial margin (IM)", "Equity required to increase exposure or release collateral"],
          ["INVALID", "Outcome for questions that cannot be resolved as YES or NO; settles at a captured price"],
          ["IOC", "Immediate or cancel; unfilled quantity is cancelled"],
          ["Keeper", "Any account performing permissionless upkeep: rollovers, sampling, liquidation and settlement"],
          ["Lot", "0.001 claim; the minimum size increment"],
          ["Maintenance margin (MM)", "Minimum equity to hold a position; below it the account is eligible for liquidation"],
          ["Mark", "Price used for margin, health and P&L"],
          ["Open interest", "Total long claims outstanding, equal to total short claims"],
          ["Post only", "Order that rests without matching; rejected if it would match on entry"],
          ["Premium", "Payment from leveraged accounts to the reserve for deficit coverage"],
          ["Reduce only", "Order flag or market state permitting only position reductions"],
          ["Release", "Return of market collateral to the free vault"],
          ["Reserve", "Per-market capital pool that absorbs leveraged losses"],
          ["T", "Scheduled resolution time of a market"],
          ["Takeover", "Transfer of an entire account to the reserve; the account's claim becomes zero"],
          ["Tick", "Price increment of 0.001"],
          ["tUSDC", "Testnet collateral token"],
        ]} /> },
      ],
    },
    {
      slug: "faq",
      title: "Troubleshooting",
      summary: "Common questions and issues, and how to resolve them.",
      sections: [
        { id: "max-loss", title: "Maximum loss", body: <p>The maximum loss in a market is the collateral allocated to it. Losses beyond that amount are absorbed by the reserve; an account can never owe a debt.</p> },
        { id: "collateral-value", title: "Collateral value", body: <p>The current deployment runs on Monad testnet. tUSDC is a test token with no monetary value. See <Link href="/terms">Terms of use</Link>.</p> },
        { id: "no-price", title: "Mark or index unavailable", body: <p>The market is most likely resuming after inactivity. Reference prices typically arrive within one to two minutes, and the mark requires a further minute of book samples. See <Link href="/docs/terminal#waking">Market wake-up</Link>.</p> },
        { id: "leverage-low", title: "Leverage below 5×", body: <p>5× is a ceiling. Available leverage decreases with time to resolution, position size and reserve capacity, and is 1× during bootstrap and from T − 12h 30m. See <Link href="/docs/leverage#caps">Leverage caps</Link>.</p> },
        { id: "rejected", title: "Order rejected", body: <p>The ticket displays the contract&apos;s reason. Common causes are insufficient margin (including open orders), an epoch rollover in progress and reduce-only mode. See <Link href="/docs/orders#rejections">Rejection reasons</Link>.</p> },
        { id: "not-filled", title: "Transaction confirmed without a fill", body: <p>A confirmed transaction indicates submission, not execution. Limit orders may be resting in Open orders; IOC orders may have found no liquidity at the limit price.</p> },
        { id: "release", title: "Collateral release unavailable", body: <p>Release requires a fresh index, including for flat accounts, and is paused during epoch rollover. Leveraged accounts may release only collateral in excess of initial margin. Free vault balance can always be withdrawn.</p> },
        { id: "funding-stuck", title: "Incomplete funding sequence", body: <p>Each funding step is a separate transaction, and confirmed steps are listed with explorer links. Collateral that was deposited but not allocated remains in the free vault and is used first on retry.</p> },
        { id: "gas", title: "Insufficient gas", body: <p>All transactions, including tUSDC minting, require testnet MON. Request it from the <a href="https://faucet.monad.xyz/" target="_blank" rel="noreferrer">Monad faucet</a> for the address selected in Osyleum.</p> },
        { id: "history", title: "History unavailable", body: <p>History is served by an indexer. When the indexer is unavailable, history and history-based P&L are reported as unavailable; current balances and positions continue to be read from the chain.</p> },
        { id: "wrong-wallet", title: "Balances not shown", body: <p>Confirm the selected wallet in the wallet menu. Balances and positions are scoped per address, and switching wallets does not transfer funds.</p> },
        { id: "claimed-final", title: "Outcome final but claims unavailable", body: <p>Claims open after settlement preparation completes, which follows oracle finality. Preparation can be advanced by any user from the Operations panel.</p> },
        { id: "support", title: "Support", body: <p>Contact the Osyleum team through the channel through which testnet access was provided. Never share a private key or seed phrase.</p> },
      ],
    },
  ],
};
