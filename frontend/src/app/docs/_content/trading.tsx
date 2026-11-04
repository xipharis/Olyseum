import Link from "next/link";
import { Note, Table, type DocGroup } from "./kit";

export const trading: DocGroup = {
  title: "Trading",
  pages: [
    {
      slug: "terminal",
      title: "Trading terminal",
      summary: "Layout and components of the market page.",
      sections: [
        { id: "layout", title: "Layout", body: <p>Each market has a dedicated terminal. On desktop, the order ticket and Balances panel occupy the left column, the order book the centre and the price chart the right, with account activity below. On smaller screens the panels stack vertically.</p> },
        { id: "header", title: "Market header", body: <>
          <p>The header displays the market question, status, YES <strong>mark</strong> and <strong>index</strong> prices, open interest, currently available leverage and the trading close time.</p>
          <p>Values that the contract cannot yet supply are rendered as an outlined marker with a reason (for example &ldquo;no mark&rdquo; or &ldquo;book empty&rdquo;). Unavailable values are never displayed as zero.</p>
        </> },
        { id: "chart", title: "Price chart", body: <>
          <p>The chart plots recorded reference-source observations. The range selector supports <strong>Live, 1H, 6H, 1D</strong> and <strong>All</strong>; individual observations can be inspected by pointer or arrow keys.</p>
          <ul>
            <li>The solid series is the reference source. The trading <strong>index</strong> is its 300-second time-weighted average.</li>
            <li>The optional dashed line is the <strong>current</strong> mark, not a historical mark series.</li>
            <li>Invalid observations and gaps longer than 30 seconds break the series.</li>
          </ul>
          <p>The chart and order book share a single price axis from 0.00 to 1.00.</p>
        </> },
        { id: "book", title: "Order book", body: <>
          <p>Bids are shown in green and asks in orange. Sizes are gross resting claims per price level and can include orders that are no longer admissible. Executable size is determined by the contract&apos;s order preview and fill events.</p>
          <p>Selecting a price level copies it into the order ticket without submitting anything.</p>
        </> },
        { id: "tabs", title: "Account tabs", body: <>
          <Table rows={[
            ["Tab", "Contents"],
            ["Position", "Account value, P&L, position details, and Close / Reduce 50% actions"],
            ["Open orders", "Resting orders, with cancel and cancel-all"],
            ["History", "Fills, deposits, releases and claims (requires the indexer)"],
            ["Protection", "Automated protection rules"],
          ]} />
          <p>The <strong>Market details</strong> selector provides additional panels: Market info (rules and contract details), Risk, Liquidity (the reserve), Resolution and Operations (permissionless upkeep).</p>
        </> },
        { id: "waking", title: "Market wake-up", body: <>
          <p>On testnet, price and maker services for inactive markets are suspended and resume when the market is opened. A progress indicator reports three stages:</p>
          <Table rows={[
            ["Stage", "Condition", "Typical duration"],
            ["Price", "Fresh reference observations fill the 300-second index window", "One to two minutes"],
            ["Trading", "The mark has one minute of order-book samples", "About one minute"],
            ["Full leverage", "The mark has stabilized and leverage caps return to the deployment ceiling", "Varies"],
          ]} />
          <p>If an hourly epoch update is in progress, it completes first. The indicator updates automatically.</p>
        </> },
        { id: "block", title: "Block consistency", body: <p>All values in the terminal are read at a specific block, and related values on screen are read from the same block. The connection indicator in the header reports whether the RPC connection is live, lagging or unreachable. If the terminal reports an interrupted connection, refresh before trading.</p> },
      ],
    },
    {
      slug: "orders",
      title: "Placing orders",
      summary: "Order direction, order types, previews, sizing and admission.",
      sections: [
        { id: "direction", title: "Direction", body: <p>The ticket offers <strong>Long YES</strong> and <strong>Short YES</strong>. Long NO is equivalent to Short YES, and Short NO is equivalent to Long YES; all directions net into the same position. Prices in the ticket, order book and chart are YES prices.</p> },
        { id: "types", title: "Order types", body: <><Table rows={[
          ["Type", "Behaviour"],
          ["Market", "An IOC priced from visible depth, up to 0.020 beyond the best price. Any unfilled remainder is cancelled"],
          ["Limit", "Matches available liquidity at the limit price or better, then rests the remainder until filled, cancelled or expired"],
          ["IOC", "Immediate or cancel. Matches available liquidity and cancels any remainder"],
          ["Post only", "Rests on the book without matching. Rejected if any part would match on entry"],
        ]} />
          <p>The order type, <strong>Reduce only</strong> and expiry are set under the <strong>Order type</strong> selector in the ticket.</p>
        </> },
        { id: "price-size", title: "Price and size", body: <>
          <p>Prices range from 0.001 to 0.999. Size is entered in claims with up to three decimal places; the minimum is 0.001 claim (one <em>lot</em>). For a buy, the price is the maximum accepted; for a sell, the minimum.</p>
          <p>A fully backed buy costs <strong>size × price</strong>. A fully backed sell requires <strong>size × (1 − price)</strong>. Leveraged requirements are set by the margin model; see <Link href="/docs/leverage">Leverage and margin</Link>.</p>
        </> },
        { id: "preview", title: "Order preview", body: <>
          <p>Before signing, the ticket requests a contract preview of the exact order. The preview reports:</p>
          <ul>
            <li>whether the order opens, increases, reduces, closes or reverses the position;</li>
            <li>the largest admissible size at the current block;</li>
            <li>the required margin and the account value under YES and NO after the order;</li>
            <li>the fee cap reserved for the order (fees are currently zero).</li>
          </ul>
          <p>The preview is re-evaluated at submission, so an outdated quote cannot be signed.</p>
        </> },
        { id: "max", title: "Max", body: <p><strong>Max</strong> performs a bounded search for the largest admissible order at the entered price, pinned to a single block. If the search does not complete, it returns the largest size it verified.</p> },
        { id: "leverage", title: "Leverage and funding", body: <>
          <p>For a new position, the ticket provides a leverage selector from 1× up to the market&apos;s current cap. Leverage above 1× requires a live mark. The ticket computes the collateral the order needs at the chosen leverage, adding a 1% buffer for leveraged orders, and compares it with the market balance.</p>
          <p>If the market balance is insufficient, the shortfall is funded from the free vault and wallet in the same flow, with approve, deposit and allocate added ahead of the order. All steps are listed and the funding amount must be acknowledged before signing. For an existing position, a shortfall reported by the contract preview is funded the same way.</p>
          <p>The contract preview remains authoritative; the ticket&apos;s collateral calculation is an estimate of what the preview will accept.</p>
        </> },
        { id: "leverage-sizing", title: "Leverage sizing", body: <>
          <p>For an existing position, the ticket can size an order to a target leverage, measured against the live mark and adjusted for the spread. The order is sized so the <em>resulting</em> position reaches the target. On the opposite side, the order reduces toward the target and never reverses the position.</p>
          <p>Leverage sizing requires a live mark, Reduce only disabled and no open orders.</p>
        </> },
        { id: "reduce-only", title: "Reduce only", body: <>
          <p>A <strong>Reduce only</strong> order can decrease the position but cannot increase or reverse it. Only reduce-only orders are accepted during the final hour before resolution.</p>
          <Note>A reduction cannot cross zero. To move from long to short, close the long position first, then open the short as new exposure.</Note>
        </> },
        { id: "expiry", title: "Expiry", body: <p>Resting orders accept an optional expiry block, after which the order can no longer fill. Without an expiry, the order rests until filled or cancelled.</p> },
        { id: "open-orders", title: "Margin for open orders", body: <>
          <p>Resting orders consume margin before they fill. Admission assumes every resting order may fill at its worst limit and requires the account to support all of them simultaneously.</p>
          <p>Cancelling an order releases its margin. <strong>Cancel all</strong> also resets the account&apos;s order epoch, which clears conservative bounds that individual cancellations can leave in place.</p>
        </> },
        { id: "rejections", title: "Rejection reasons", body: <>
          <Table rows={[
            ["Reason", "Description"],
            ["Insufficient margin", "Required initial margin exceeds account equity, including open orders"],
            ["Market coverage", "The reserve cannot cover additional leveraged exposure"],
            ["Account deficit cap", "The account's worst-case deficit would exceed the per-account limit"],
            ["Full backing required", "The market is in bootstrap or the final-day window"],
            ["Reduce only", "The market is restricted to reductions, or halted"],
            ["Accounting update", "An hourly epoch update is in progress"],
            ["Post only crosses", "A Post only order would match on entry"],
          ]} />
          <p>The ticket displays the contract&apos;s rejection reason.</p>
        </> },
      ],
    },
    {
      slug: "collateral",
      title: "Collateral and balances",
      summary: "Collateral locations, funding, release and withdrawal.",
      sections: [
        { id: "balances", title: "Balances", body: <>
          <Table rows={[
            ["Balance", "Location", "Usage"],
            ["Wallet", "The user's address", "Unrestricted"],
            ["Free vault", "CollateralVault, unallocated", "Allocation to a market, or withdrawal to the wallet"],
            ["Market balance", "Allocated to one market engine", "Margin for positions and orders in that market"],
          ]} />
          <p>Markets are <strong>isolated</strong>. Collateral allocated to one market cannot cover losses in another, and a liquidation in one market does not affect any other.</p>
        </> },
        { id: "funding", title: "Funding a market", body: <>
          <p>A market can be funded in two ways:</p>
          <ul>
            <li><strong>From the order ticket.</strong> When an order needs more collateral than the market balance holds, the ticket adds the funding transactions ahead of the order. See <Link href="/docs/orders#leverage">Leverage and funding</Link>.</li>
            <li><strong>Manually.</strong> Use <strong>Manage collateral</strong> in the Balances panel to approve, deposit and allocate a chosen amount.</li>
          </ul>
          <p>In both cases, free vault balance is applied before wallet balance.</p>
          <p>If a step fails, the feedback lists each confirmed step with its explorer link. A retry resumes from the free vault balance.</p>
          <Note>Funding is unavailable during accounting maintenance, such as an hourly epoch update, and is re-checked before each step. Withdrawal of free vault balance remains available.</Note>
        </> },
        { id: "releasable", title: "Releasable balance", body: <>
          <p><strong>Releasable</strong> is the amount of market balance the contract permits returning to the free vault at the current block. For an account with no position and no orders, this is the full balance. For a leveraged account, release must leave the account above initial margin, including open orders, final-day backing and market coverage requirements.</p>
          <p>Release requires a fresh index price, including for flat accounts. Free vault balance can be withdrawn regardless.</p>
        </> },
        { id: "release-withdraw", title: "Release and withdrawal", body: <>
          <p>Returning collateral to the wallet takes two transactions: <strong>release</strong> (market to free vault) and <strong>withdraw</strong> (free vault to wallet). Keeping these separate allows collateral to remain in the vault for reallocation.</p>
          <p>After a full <strong>Close position</strong>, the terminal offers to perform release and withdrawal in sequence.</p>
        </> },
        { id: "account-model", title: "Account model", body: <p>Within a market, an account consists of two values: cash and position. A leveraged long purchases more claims than its deposit covers, so its cash is negative while the position offsets it. Negative cash is not a debt. Solvency is measured by <strong>equity</strong>: cash plus the position valued at the mark.</p> },
      ],
    },
    {
      slug: "positions",
      title: "Positions and P&L",
      summary: "Position fields, closing positions and P&L calculation.",
      sections: [
        { id: "fields", title: "Position fields", body: <>
          <p>The Position tab opens with <strong>Your money</strong>: the account&apos;s current value in the market and its profit or loss since funding, followed by these fields:</p>
          <Table rows={[
            ["Field", "Definition"],
            ["Position", "Claims held, long or short"],
            ["Average entry", "Weighted-average YES price of the open position; requires indexer history"],
            ["Mark now", "Current YES mark price"],
            ["Leverage", "Exposure divided by equity"],
            ["Before liquidation", "Equity above maintenance margin. Fully backed positions show Fully backed"],
            ["If YES / if NO", "Account value at settlement under each outcome"],
            ["Funding accrued", "Funding already included in the balance; positive values are paid"],
            ["Health", "Account margin status; see Health and liquidation"],
          ]} />
          <p>A value chart shows the account value sampled over time. Samples are recorded while the market page is open and are stored on the current device only.</p>
          <p>Margin, funding and premium details are available under <strong>Margin & funding details</strong>. Grace periods and liquidation warnings are always displayed.</p>
        </> },
        { id: "closing", title: "Closing and reducing", body: <>
          <p><strong>Close position</strong> and <strong>Reduce 50%</strong> prepare a reduce-only order in the ticket for review. The limit price is set at the level where visible depth covers the size, bounded to 0.020 from the best price.</p>
          <p>If depth is insufficient, part of the position may remain open. The result shows filled and remaining quantity.</p>
        </> },
        { id: "pnl", title: "P&L calculation", body: <>
          <p>Profit or loss is the current account value minus net collateral allocated to the market (allocations less releases). Net allocation is taken from indexer history when it is complete. Otherwise, it is taken from deposits recorded in the current browser, and the panel labels it accordingly. If neither source is available, P&L is reported as unavailable.</p>
          <p>Average entry is computed from actual fills and is never inferred from collateral or the current mark. Funding and premium are included in account value as they accrue and are not deducted separately.</p>
        </> },
        { id: "portfolio", title: "Portfolio", body: <>
          <p><Link href="/portfolio">Portfolio</Link> summarizes the selected wallet across all markets:</p>
          <Table rows={[
            ["Summary", "Definition"],
            ["In markets", "Total value of all funded market accounts"],
            ["Profit / loss", "Total P&L since funding, across markets with deposit history"],
            ["Ready to trade", "Wallet balance plus free vault balance"],
          ]} />
          <p>Below the summary, each market is listed with status, net position, value, P&L, value if YES / NO, health and releasable balance. Markets that cannot be read are reported rather than omitted.</p>
        </> },
      ],
    },
    {
      slug: "protection",
      title: "Protection rules",
      summary: "Automated rules that submit reduce-only orders, cancellations or claims on the user's behalf.",
      sections: [
        { id: "overview", title: "Overview", body: <>
          <p>A protection rule monitors a position and submits a single transaction when its condition is met. Rules are executed by the Olyseum automation worker using the <strong>Background protection</strong> permission (see <Link href="/docs/wallets#permissions">Delegated permissions</Link>).</p>
          <p>Requirements: an embedded Privy wallet, the permission granted for the market, and an online worker. The Protection tab reports any missing requirement.</p>
        </> },
        { id: "rules", title: "Rule types", body: <Table rows={[
          ["Rule", "Trigger and action"],
          ["Stop loss", "Submits a reduce-only order when the YES mark crosses the trigger against the position"],
          ["Take profit", "Submits a reduce-only order when the YES mark crosses the trigger in favour of the position"],
          ["Cancel before close", "Cancels open orders when the market becomes reduce-only, or 75 minutes before the scheduled end, whichever is earlier"],
          ["Margin guard", "Reduces the position when equity falls below initial margin (leveraged markets only)"],
          ["Backing floor guard", "From T − 12h 30m, reduces the position if it is not fully backed (leveraged markets only)"],
          ["Deliver settlement claim", "Claims the settlement payout once claims are enabled (where supported)"],
        ]} /> },
        { id: "parameters", title: "Parameters", body: <Table rows={[
          ["Parameter", "Description"],
          ["Trigger mark (YES)", "YES mark price that triggers a stop loss or take profit"],
          ["Worst acceptable YES price", "Limit price of the submitted order"],
          ["Maximum claims to close", "Maximum reduction size"],
          ["Expires in hours", "Rule lifetime, from 1 to 168 hours"],
        ]} /> },
        { id: "limitations", title: "Limitations", body: <Note tone="warn">
          <p>Triggered orders are reduce-only IOC orders at the configured limit. With insufficient depth, part or all of the position can remain open. Each rule submits at most one transaction.</p>
          <p>Price triggers require a valid mark, and no rule executes while the worker is offline. Protection rules do not guarantee execution.</p>
        </Note> },
        { id: "monitoring", title: "Monitoring", body: <p>Each rule displays its status and, once triggered, its transaction link. <strong>Protection activity</strong> provides a per-block log. Active rules can be cancelled at any time.</p> },
      ],
    },
    {
      slug: "spot",
      title: "Spot markets",
      summary: "Trading native YES and NO outcome tokens on Kuru.",
      sections: [
        { id: "overview", title: "Overview", body: <>
          <p><strong>Native</strong> markets are events listed by Olyseum directly rather than referenced from Polymarket. Each native market has a vault that issues a YES token and a NO token, which trade on Kuru order books on Monad.</p>
          <p>Spot trading involves no leverage, margin, funding or liquidation. Tokens are bought and sold outright, and winning tokens are redeemed for collateral after resolution. Native perpetual markets derive their index from the Kuru YES book.</p>
        </> },
        { id: "pairs", title: "Minting and redeeming pairs", body: <>
          <p>One YES token and one NO token together are always worth exactly 1 tUSDC. The vault supports two operations:</p>
          <Table rows={[
            ["Operation", "Input", "Output", "Availability"],
            ["Mint pairs", "1 tUSDC", "1 YES + 1 NO", "Until the event halts or the vault cap is reached"],
            ["Redeem pairs", "1 YES + 1 NO", "1 tUSDC", "Until the outcome is final"],
          ]} />
          <p>Collateral remains in the vault, so every token is fully backed.</p>
        </> },
        { id: "orders", title: "Order types", body: <>
          <Table rows={[
            ["Type", "Behaviour"],
            ["Market", "Executes immediately against the Kuru book, settling wallet to wallet. Slippage limits of 0.5%, 1% or 2% are available; the order reverts if the limit is exceeded"],
            ["Limit", "Post-only order resting on the Kuru book. Funds are locked in the Kuru margin account until the order fills or is cancelled"],
          ]} />
          <p>Spot prices are displayed in cents (56.3¢ corresponds to 0.563). Where an action requires multiple transactions, the ticket states the number of confirmations. <strong>Move Kuru balance to wallet</strong> withdraws any balance held in the Kuru margin account.</p>
        </> },
        { id: "resolution", title: "After resolution", body: <p>Once the event halts, new orders are disabled; cancellation, withdrawal and pair redemption remain available. After the outcome is final, the market&apos;s Resolution panel provides <strong>Redeem</strong>, which pays winning tokens out in tUSDC. On an INVALID outcome, each token redeems for its share of the captured price.</p> },
      ],
    },
  ],
};
