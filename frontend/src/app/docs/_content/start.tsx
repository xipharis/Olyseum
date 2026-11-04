import Link from "next/link";
import { Cards, Note, Table, type DocGroup } from "./kit";

export const introduction: DocGroup = {
  title: "Introduction",
  pages: [
    {
      slug: "",
      title: "Overview",
      summary: "Osyleum is a protocol for leveraged long and short exposure to real-world event outcomes, built on a fully on-chain order book on Monad.",
      sections: [
        { id: "introduction", title: "Introduction", body: <>
          <p>Each Osyleum market is a binary question with a scheduled resolution time, for example &ldquo;Will the Golden State Warriors beat the Miami Heat on 5 November 2026?&rdquo; The YES price trades between 0 and 1 and represents the market&apos;s implied probability of the event.</p>
          <p>Traders take a <strong>long</strong> position to gain from a rising YES price or a <strong>short</strong> position to gain from a falling one. A position can be closed at any time before the market halts, or held to resolution and settled against the actual outcome. Eligible markets support leverage of up to 5×.</p>
          <p>Order matching, margin checks, the reserve that backs leverage, and settlement are all executed by contracts on Monad.</p>
        </> },
        { id: "design", title: "Design principles", body: <>
          <p>A YES claim pays 1 if the event occurs and 0 if it does not. At resolution, its price does not converge gradually: it moves to 0 or 1 in a single block. A leveraged position on the losing side cannot be liquidated in time, so its loss cannot be recovered from the trader. Osyleum addresses this with two rules:</p>
          <ol>
            <li><strong>Leverage is unwound before resolution.</strong> From T − 12h 30m, every account must return to full backing on a fixed schedule.</li>
            <li><strong>Residual losses are covered by a pre-funded reserve.</strong> The contracts continuously verify that the reserve can meet all deficits under both a YES and a NO outcome.</li>
          </ol>
          <p>As a result, a trader&apos;s maximum loss in a market is limited to the collateral allocated to it. Losses beyond that amount are absorbed by the reserve.</p>
        </> },
        { id: "market-types", title: "Market types", body: <>
          <Table rows={[
            ["", "Event perpetual", "Spot (Kuru)"],
            ["Instrument", "Long or short position on the YES price", "YES and NO outcome tokens"],
            ["Leverage", "Up to the market's cap (maximum 5×)", "None"],
            ["Venue", "Osyleum on-chain order book", "Kuru order books on Monad"],
            ["Price reference", "External index (Polymarket or a Kuru book) and the Osyleum book", "Kuru book prices"],
            ["Settlement", "Claim from the market engine", "Redeem winning tokens through the vault"],
          ]} />
          <p>Native events can list both. The terminal provides a venue selector: <strong>Perp on Osyleum (long / short)</strong> or <strong>YES/NO tokens on Kuru (spot)</strong>.</p>
        </> },
        { id: "architecture", title: "Architecture", body: <Table rows={[
          ["Component", "Responsibility"],
          ["Market engine", "Order book, margin, liquidation and settlement for a single market"],
          ["CollateralVault", "Custody of trader collateral across all markets"],
          ["ReserveVault", "Per-market reserve that covers leveraged deficits"],
          ["ResolutionOracle", "Determines outcomes and is the only contract that can halt or settle a market"],
          ["Price publisher", "Fetches external reference prices, validates them and publishes signed observations"],
          ["Keepers", "Permissionless upkeep: epoch rollovers, price sampling, liquidations and settlement preparation"],
          ["Trading app", "Market discovery, wallet connection, trading and account management"],
        ]} /> },
        { id: "testnet", title: "Network status", body: <>
          <p>Osyleum is deployed on Monad testnet (chain ID 10143). The current deployment has the following properties:</p>
          <ul>
            <li>Collateral is <strong>tUSDC</strong>, a test token with no monetary value.</li>
            <li>Risk parameters use a synthetic calibration.</li>
            <li>Resolution layer 1 runs on a single simulation node rather than a Chainlink DON. Disputes are decided by the Osyleum team through a sandbox oracle rather than by UMA voters.</li>
            <li>Testnet state may be reset, and markets may be archived.</li>
          </ul>
        </> },
        { id: "next-steps", title: "Next steps", body: <Cards items={[
          { href: "/docs/quick-start", title: "Quick start", text: "Connect a wallet, obtain test collateral and place a first order." },
          { href: "/docs/event-perps", title: "Event perpetuals", text: "Claims, pricing, and long and short exposure." },
          { href: "/docs/leverage", title: "Leverage and margin", text: "Leverage limits, margin requirements and admission checks." },
          { href: "/docs/lifecycle", title: "Market lifecycle", text: "The schedule each market follows through to settlement." },
          { href: "/docs/resolution", title: "Resolution", text: "How outcomes are proposed, disputed and finalized." },
          { href: "/docs/glossary", title: "Glossary", text: "Definitions of the terms used across the protocol." },
        ]} /> },
      ],
    },
    {
      slug: "event-perps",
      title: "Event perpetuals",
      summary: "The instrument traded on Osyleum: claims, prices, position direction and settlement.",
      sections: [
        { id: "claims", title: "Claims", body: <>
          <p>All exposure on Osyleum is denominated in <strong>claims</strong>. A claim pays <strong>1 tUSDC on YES</strong> and <strong>0 on NO</strong>. If a market resolves INVALID, a claim pays a captured price between 0 and 1 (see <Link href="/docs/settlement">Settlement and claims</Link>).</p>
          <p>Because a claim pays at most 1, its price is bounded between 0 and 1 and can be read as an implied probability. Prices are quoted in increments of 0.001, from 0.001 to 0.999.</p>
        </> },
        { id: "direction", title: "Position direction", body: <>
          <p>A <strong>long</strong> position gains when the YES price rises and pays out if the event occurs. A <strong>short</strong> position gains when the YES price falls and pays out if it does not. Because the NO price is always 1 minus the YES price, NO exposure maps directly to YES exposure:</p>
          <Table rows={[
            ["Position", "Equivalent to", "Profits when"],
            ["Long YES", "Short NO", "The YES price rises, or the event occurs"],
            ["Short YES", "Long NO", "The YES price falls, or the event does not occur"],
          ]} />
          <p>Each account holds a single net position per market. A sell order against a long position reduces that position; it does not open a separate short.</p>
        </> },
        { id: "example", title: "Example", body: <>
          <p>The YES price is 0.40. A trader opens a fully backed long of 100 claims at a cost of 100 × 0.40 = <strong>40 tUSDC</strong>.</p>
          <Table rows={[
            ["Scenario", "Result"],
            ["Price rises to 0.55; position closed", "55 tUSDC returned, a profit of 15 tUSDC"],
            ["Held to resolution; outcome YES", "100 tUSDC paid (1 per claim)"],
            ["Held to resolution; outcome NO", "0 paid; the 40 tUSDC cost is lost"],
          ]} />
          <p>A fully backed short of 100 claims at 0.40 requires 100 × (1 − 0.40) = 60 tUSDC, which is its maximum loss if the event occurs.</p>
        </> },
        { id: "perpetual", title: "Perpetual mechanics", body: <>
          <p>A conventional perpetual future tracks an underlying price indefinitely, with periodic funding keeping it aligned with spot. Osyleum applies the same structure to events: the Osyleum book trades against an external reference price, the <strong>index</strong>, and on leveraged markets an hourly <Link href="/docs/funding">funding</Link> payment keeps the two aligned.</p>
          <p>Unlike a conventional perpetual, an event perpetual has a scheduled end. It trades as a perpetual while the question is open, then unwinds leverage and settles on the observed outcome.</p>
        </> },
        { id: "time-decay", title: "Time to resolution", body: <>
          <p>The expected total movement of an event price is independent of the time remaining. With one month remaining, that movement is distributed across a month; with one hour remaining, it is concentrated into an hour, and at resolution it occurs as a single jump.</p>
          <p>For this reason, margin requirements increase as resolution approaches, available leverage can decrease without any change in price, and all leveraged accounts must be fully backed before the final twelve hours. See <Link href="/docs/leverage">Leverage and margin</Link> and <Link href="/docs/lifecycle">Market lifecycle</Link>.</p>
        </> },
      ],
    },
  ],
};

export const gettingStarted: DocGroup = {
  title: "Getting started",
  pages: [
    {
      slug: "quick-start",
      title: "Quick start",
      summary: "Connect a wallet, fund a market and place a first order.",
      sections: [
        { id: "guided", title: "Guided setup", body: <p>The <Link href="/start">Start</Link> page walks through the steps below and marks each one complete as it detects the result on chain. The steps can also be performed manually, as described here.</p> },
        { id: "prerequisites", title: "Prerequisites", body: <ul>
          <li>An email address, a Google account, or an existing EVM wallet.</li>
          <li>Testnet MON for gas, available from the <a href="https://faucet.monad.xyz/" target="_blank" rel="noreferrer">Monad testnet faucet</a>. 0.2 MON covers a first funded trade.</li>
        </ul> },
        { id: "log-in", title: "1. Log in", body: <>
          <p>Select <strong>Log in</strong> in the header and choose a method:</p>
          <ul>
            <li><strong>Email or Google.</strong> Privy creates an embedded wallet if the account does not already have one. No installation is required, and trading transactions are signed without confirmation prompts (see <Link href="/docs/wallets#instant-trading">Instant trading</Link>).</li>
            <li><strong>Existing wallet.</strong> Choose wallet login and approve the connection request. Every transaction is confirmed in the wallet.</li>
          </ul>
          <p>Market data is available without logging in. An account is only required to sign transactions.</p>
        </> },
        { id: "get-gas", title: "2. Obtain testnet MON", body: <>
          <p>Every transaction requires MON for gas. Copy the selected address from the wallet menu and request testnet MON from the <a href="https://faucet.monad.xyz/" target="_blank" rel="noreferrer">Monad faucet</a>. The wallet menu displays the current gas balance.</p>
          <Note>Mainnet MON cannot pay testnet gas. Send testnet MON to the address selected in Osyleum.</Note>
        </> },
        { id: "get-tusdc", title: "3. Obtain test collateral", body: <p>Mint 1,000 tUSDC from the Start page, or 1,000 or 10,000 tUSDC from the <strong>tUSDC faucet</strong> in the wallet menu. Minting is a transaction and requires gas.</p> },
        { id: "trade", title: "4. Place an order", body: <>
          <p>Open a market from <Link href="/markets">Markets</Link>. In the order ticket, select <strong>Long YES</strong> or <strong>Short YES</strong>, enter a size in claims and choose a leverage. For a new position, the ticket calculates the collateral the order requires and adds the funding transactions (approve, deposit and allocate) ahead of the order. Every step is listed, and the funding amount must be acknowledged, before anything is signed.</p>
          <p>Review the contract preview, which reports whether the order is admissible, its cost and its effect on the position, then submit. Filled quantity appears in the <strong>Position</strong> tab; resting quantity appears in <strong>Open orders</strong>.</p>
          <Note>A confirmed transaction does not imply a filled order. Orders can fill partially, rest on the book or be rejected. Confirm the result in the Position and Open orders tabs.</Note>
        </> },
        { id: "monitor", title: "5. Monitor the position", body: <p>The Position tab shows the account&apos;s current value, profit or loss since funding, leverage and remaining margin before liquidation. <Link href="/portfolio">Portfolio</Link> aggregates these figures across markets. See <Link href="/docs/positions">Positions and P&L</Link>.</p> },
        { id: "next-steps", title: "Next steps", body: <Cards items={[
          { href: "/docs/orders", title: "Placing orders", text: "Order types, reduce-only, Max and leverage sizing." },
          { href: "/docs/positions", title: "Positions and P&L", text: "Position fields, closing and P&L calculation." },
          { href: "/docs/protection", title: "Protection rules", text: "Automated stop loss, take profit and margin rules." },
          { href: "/docs/faq", title: "Troubleshooting", text: "Common issues and their resolution." },
        ]} /> },
      ],
    },
    {
      slug: "wallets",
      title: "Wallets and permissions",
      summary: "Supported wallet types, multi-wallet accounts, and delegated trading permissions.",
      sections: [
        { id: "wallet-types", title: "Wallet types", body: <>
          <p>Authentication is provided by <a href="https://www.privy.io/" target="_blank" rel="noreferrer">Privy</a>. Two wallet types are supported:</p>
          <Table rows={[
            ["Type", "Created by", "Notes"],
            ["Embedded wallet", "Privy, on email or Google login", "Supports instant trading and background protection; exportable"],
            ["External wallet", "The user (any EVM wallet)", "Every transaction is confirmed in the wallet"],
          ]} />
        </> },
        { id: "multiple", title: "Multiple wallets", body: <>
          <p>A single login can hold several wallets. Use the wallet menu to connect an additional wallet or create a Privy wallet, then select the wallet to trade from.</p>
          <p>Balances, positions and orders are scoped to the <strong>selected address</strong>. Creating or switching wallets does not transfer funds or positions.</p>
          <Note tone="warn">Changing the wallet, network or login session during a multi-step sequence (for example approve, deposit, allocate) cancels the remaining steps. A transaction that was already submitted can still execute; verify balances and the explorer before retrying.</Note>
        </> },
        { id: "network", title: "Network", body: <p>Osyleum operates on Monad testnet (chain ID 10143) only. When the wallet is connected to another network, actions display <strong>Switch to Monad testnet</strong>, and the wallet menu can switch networks.</p> },
        { id: "export", title: "Wallet export", body: <p>An embedded wallet can be exported with <strong>Export Privy wallet</strong> in the wallet menu. The private key is displayed in Privy&apos;s secure interface for import into another wallet. Do not share the key with any person or website, including the Osyleum team.</p> },
        { id: "instant-trading", title: "Instant trading", body: <>
          <p>With an embedded wallet, <strong>Instant trading</strong> is enabled by default. Allowlisted calls are signed in the browser without Privy&apos;s confirmation screen:</p>
          <Table rows={[
            ["Signed instantly", "Always confirmed"],
            ["Placing, cancelling and cancelling all orders on verified markets", "Withdrawals and collateral releases"],
            ["Approving and depositing collateral to the CollateralVault", "Reserve deposits"],
            ["Allocating collateral to a verified market", "Token transfers and calls to any other contract"],
          ]} />
          <p>The setting is stored per address and can be turned off with the <strong>Instant trading</strong> switch in the wallet menu. External wallets always confirm every transaction.</p>
        </> },
        { id: "permissions", title: "Delegated permissions", body: <>
          <p>Embedded wallets can additionally grant server-side signing permissions under <strong>Trading permissions</strong> in the wallet menu. Unlike instant trading, these allow transactions to be signed while the browser is closed:</p>
          <Table rows={[
            ["Permission", "Allows", "Never allows"],
            ["Server-signed trading", "Placing and cancelling orders", "Token transfers, withdrawals, collateral release or oracle bonds"],
            ["Background protection", "Reduce-only orders and cancellations when a protection rule triggers", "Token transfers, withdrawals, collateral release or oracle bonds"],
          ]} />
          <p>Each permission is a separate signer constrained by a policy. The signer ID, policy ID and covered markets are displayed before the permission is granted. Permissions are valid on Monad testnet only.</p>
          <p><strong>Revoke all additional signers</strong> removes every delegated permission and prevents new signatures immediately; transactions already broadcast may still confirm. Logging out or disconnecting does not revoke a permission.</p>
          <Note>If the signing service is not configured for the deployment, the panel says so. Instant trading does not depend on it.</Note>
        </> },
        { id: "storage", title: "Browser storage", body: <p>Privy requires browser storage to maintain a session. If storage is blocked, public pages remain available and the wallet button describes how to restore login.</p> },
      ],
    },
  ],
};
