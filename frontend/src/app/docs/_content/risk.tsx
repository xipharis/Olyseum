import Link from "next/link";
import { Formula, Note, Table, Tex, type DocGroup } from "./kit";

export const risk: DocGroup = {
  title: "Risk and pricing",
  pages: [
    {
      slug: "leverage",
      title: "Leverage and margin",
      summary: "Leverage limits, margin requirements and order admission.",
      sections: [
        { id: "backing", title: "Full backing and leverage", body: <>
          <p>Each account has two terminal values: its value if the market resolves NO (<Tex>{"E_0"}</Tex>) and its value if it resolves YES (<Tex>{"E_1"}</Tex>). An account is <strong>fully backed</strong> when both are non-negative. A fully backed account cannot lose more than its collateral and is not subject to price-based liquidation.</p>
          <p>An account is <strong>leveraged</strong> when one terminal value is negative. That shortfall, the <em>deficit</em>, is covered by the market&apos;s <Link href="/docs/reserve">reserve</Link>. Leveraged accounts pay a <Link href="/docs/funding#premium">jump premium</Link> to the reserve and are subject to margin requirements.</p>
          <Formula tex={String.raw`\begin{aligned}
E_0 &= \text{cash} \\
E_1 &= \text{cash} + \text{position} \\
E(q) &= \text{cash} + \text{position} \times q && \text{(equity at mark } q\text{)}
\end{aligned}`} />
        </> },
        { id: "example", title: "Example", body: <>
          <p>Account A deposits 120 tUSDC and buys 1,000 claims at 0.60. Account B deposits 100 tUSDC and sells those claims.</p>
          <Table rows={[
            ["", "Account A (long)", "Account B (short)"],
            ["Deposit", "120", "100"],
            ["Cash after fill", "−480", "700"],
            ["Equity at 0.60", "120", "100"],
            [<Tex key="e">{"E_0 / E_1"}</Tex>, "−480 / 520", "700 / −300"],
            ["Leverage", "600 / 120 = 5×", "400 / 100 = 4×"],
            ["Payout if NO / YES", "0 / 520", "700 / 0"],
          ]} />
          <p>If the market resolves NO, Account A receives 0 rather than −480. Its loss is limited to the 120 tUSDC deposited; the reserve covers the remaining 480.</p>
        </> },
        { id: "caps", title: "Leverage caps", body: <>
          <p>Each market is listed with a deployment ceiling of at most 5×. The event template sets a directional cap, and the lower of the two applies:</p>
          <Table rows={[
            ["Template", "Long", "Short", "Example"],
            ["Scheduled", "5×", "5×", "A match or election on a fixed date"],
            ["Continuous", "3×", "3×", "A price crossing a threshold"],
            ["Deadline", "3×", "1×", "An event occurring before a given date"],
            ["Unscheduled", "1×", "1×", "No defined resolution time"],
          ]} />
          <p>Caps are upper bounds. Admissible size also depends on price, position size, collateral, time to resolution and reserve capacity. The header displays current caps; the order preview reports the exact admissible size.</p>
        </> },
        { id: "im-mm", title: "Initial and maintenance margin", body: <>
          <Table rows={[
            ["Requirement", "Applies to"],
            ["Initial margin (IM)", "Opening or increasing exposure, and releasing collateral"],
            ["Maintenance margin (MM)", "Holding a position. Accounts below MM are eligible for liquidation"],
          ]} />
          <p>Both are bounded above by the position&apos;s worst-case loss: the price per claim for a long, and one minus the price for a short. That bound equals the full-backing requirement.</p>
        </> },
        { id: "formula", title: "Margin model", body: <>
          <p>For a position of <Tex>{"|x|"}</Tex> claims with worst-case loss <Tex>{"w"}</Tex> per claim:</p>
          <Formula tex={String.raw`\begin{aligned}
\mathrm{MM} &= \min\Bigl(|x|\,w,\; |x|\,\bigl(m_{\text{side}} + k\,\sigma_h + s\bigr) + \tfrac{1}{2}\,\lambda\,x^2\Bigr) \\
\mathrm{IM} &= \min\Bigl(|x|\,w,\; \max\bigl(\gamma\,\mathrm{MM},\; |x|\,w / \text{cap}\bigr)\Bigr) \\[6pt]
\sigma_h &= \max\left(\sqrt{\frac{q(1-q)\,h}{T-t}},\; \sigma_{\text{realized}},\; \sigma_{\text{template}}\right) \\
h &= h_0 + \frac{|x|}{v} + \text{queue}
\end{aligned}`} />
          <Table rows={[
            ["Term", "Meaning"],
            [<Tex key="m">{String.raw`m_{\text{side}}`}</Tex>, "Adverse drift from the probability of a jump against the position"],
            [<Tex key="k">{String.raw`k\,\sigma_h`}</Tex>, <>Tail allowance over the close-out horizon <Tex>{"h"}</Tex></>],
            [<Tex key="s">{"s"}</Tex>, "Spread and slippage allowance"],
            [<Tex key="l">{String.raw`\lambda`}</Tex>, "Size-impact coefficient, applied to the square of the position"],
            [<Tex key="g">{String.raw`\gamma`}</Tex>, "Ratio of initial to maintenance margin"],
            [<Tex key="t">{"T - t"}</Tex>, "Time remaining to resolution"],
          ]} />
          <p>The volatility term increases as <Tex>{"T - t"}</Tex> decreases, so margin rises as resolution approaches. Larger positions have a longer close-out horizon and therefore a higher requirement per claim.</p>
          <p>Rounding is always against the trader. Missing, expired or out-of-range risk parameters cause the engine to require full backing.</p>
        </> },
        { id: "admission", title: "Order admission", body: <p>Leverage is not an order parameter. It results from the position relative to equity, with every resting order assumed to fill at its worst limit. Consequently, <Link href="/docs/orders#open-orders">open orders consume margin</Link>, and bids placed well above the mark consume margin immediately, while bids at the mark consume little.</p> },
        { id: "limits", title: "System limits", body: <Table rows={[
          ["Limit", "Rule"],
          ["Market coverage", "New leveraged exposure is rejected when the reserve cannot cover all deficits under both outcomes"],
          ["Account deficit cap", "An account's worst-case deficit is limited to 2% of the reserve at activation"],
          ["Final-day backing", "From T − 12h 30m, new exposure must be fully backed; see Market lifecycle"],
        ]} /> },
      ],
    },
    {
      slug: "liquidation",
      title: "Health and liquidation",
      summary: "Account health states, grace periods and the liquidation process.",
      sections: [
        { id: "health", title: "Health states", body: <Table rows={[
          ["Status", "Condition", "Effect"],
          ["Healthy", "Equity ≥ IM, or fully backed", "No restrictions"],
          ["Below initial margin", "MM ≤ equity < IM", "No new exposure or release. A one-hour grace period begins"],
          ["Below maintenance", "Equity < MM", "Eligible for liquidation immediately"],
          ["Non-positive equity", "Equity ≤ 0", "Eligible for takeover by the reserve"],
        ]} /> },
        { id: "grace", title: "Grace period", body: <>
          <p>When an account first falls below initial margin, a <strong>one-hour</strong> grace period begins and is displayed in the terminal. Topping up or reducing during the period clears it. If the period expires with the account still below IM, keepers may reduce the position.</p>
          <p>The grace period is anchored to the epoch in which the account first fell below IM, is not renewed by further activity, and cannot extend beyond T − 12h.</p>
        </> },
        { id: "routes", title: "Liquidation routes", body: <>
          <p>A liquidation call applies the least disruptive eligible route:</p>
          <Table rows={[
            ["Order", "Route", "Description"],
            ["1", "Pair reduction", "An eligible long and an eligible short are reduced against each other at the mark, without using the book"],
            ["2", "Book close", "A reduce-only IOC through the order book, never below the account's bankruptcy price and subject to a per-block budget"],
            ["3", "Takeover", "The entire account transfers to the reserve. Applies only at non-positive equity, or at the final-day floor"],
          ]} />
          <p>Insufficient liquidity never authorizes the takeover of an account with positive equity. If a book close cannot complete, the call reports that further work is required.</p>
          <Note tone="warn">A takeover zeroes the account in that market and invalidates its orders. The account&apos;s remaining claim in the market becomes zero.</Note>
        </> },
        { id: "eligibility", title: "Eligibility", body: <>
          <p>Eligibility is evaluated in the following order:</p>
          <ol>
            <li>Final-day floor active and <Tex>{"E_0 < 0"}</Tex> or <Tex>{"E_1 < 0"}</Tex>: takeover.</li>
            <li><Tex>{String.raw`E_0 \le 0`}</Tex> and <Tex>{String.raw`E_1 \le 0`}</Tex> (not both zero): takeover.</li>
            <li>Mark stale: not eligible.</li>
            <li>Equity at the mark ≤ 0: takeover.</li>
            <li>Equity &lt; MM: reduction.</li>
            <li>Grace expired and equity &lt; IM: reduction.</li>
          </ol>
          <p>When the mark is unavailable, health is reported as unavailable and mark-based liquidation stops; only the price-independent checks apply.</p>
        </> },
        { id: "fees", title: "Liquidation fee", body: <p>Executed reductions pay one atom per lot closed (0.001 tUSDC per claim), split equally between the reserve and the keeper. The fee is waived where it would worsen the account&apos;s position against the eligibility predicate. Takeovers pay no fee.</p> },
        { id: "keepers", title: "Keepers", body: <p>Liquidation is permissionless. The <strong>Operations</strong> panel in Market details lists eligible accounts and can submit liquidation calls. Keeper earnings are withdrawable after the settlement payout scan.</p> },
        { id: "risk-management", title: "Risk management", body: <ul>
          <li>Monitor the health status and margin bar in the Position tab.</li>
          <li>Maintain collateral above the minimum requirement.</li>
          <li>Cancel unneeded resting orders, which consume margin.</li>
          <li>Reach full backing before T − 12h. The Backing floor guard <Link href="/docs/protection">protection rule</Link> automates this.</li>
        </ul> },
      ],
    },
    {
      slug: "funding",
      title: "Funding and premium",
      summary: "Periodic payments on leveraged markets.",
      sections: [
        { id: "overview", title: "Overview", body: <>
          <Table rows={[
            ["", "Funding", "Jump premium"],
            ["Purpose", "Aligns the Osyleum price with the index", "Compensates the reserve for covering deficits"],
            ["Direction", "Longs pay shorts when the mark is above the index, and the reverse", "Leveraged accounts pay the reserve"],
            ["Fully backed accounts", "Pay or receive funding", "Exempt"],
          ]} />
          <p>Both are enabled per market and are inactive in bootstrap mode. Where a market has them disabled, the terminal does not display them.</p>
        </> },
        { id: "funding", title: "Funding", body: <>
          <p>Funding operates in <strong>hourly epochs</strong>. At each epoch opening, the engine fixes a daily per-claim rate from the difference between the mark <Tex>{"q"}</Tex> and the index <Tex>{"I"}</Tex>:</p>
          <Formula tex={String.raw`f = \operatorname{clamp}\bigl(q - I,\; -0.05\,\min(I,\, 1-I),\; +0.05\,\min(I,\, 1-I)\bigr) \quad \text{per claim per day}`} />
          <p>A positive rate means longs pay shorts. Payments are drawn from a budget authorized at the epoch opening. Funding stops for the remainder of the epoch on budget exhaustion, a stale index, T − 12h, zero open interest, or a halt, and does not resume within that epoch.</p>
        </> },
        { id: "premium", title: "Jump premium", body: <>
          <p>Leveraged accounts pay the reserve for covering their deficit:</p>
          <Formula tex={String.raw`\text{premium} = \text{deficit} \times (1 + \text{load}) \times \text{hazard} \times \text{multiplier} \quad \text{per day}`} />
          <p>The hazard is the market&apos;s estimated rate of an adverse jump. A <strong>4× multiplier</strong> applies for six hours after a new deficit is created, then reverts to 1×. The terminal displays the estimated daily premium and the surcharge countdown.</p>
          <p>The tariff is fixed at each epoch opening. Hazard increases requested by the market monitor take effect from the next epoch.</p>
        </> },
        { id: "accrual", title: "Accrual", body: <p>Funding and premium accrue continuously and are booked when the account is next updated. Displayed cash already includes unbooked amounts and should not be adjusted further.</p> },
        { id: "rollover", title: "Epoch rollover", body: <p>At each epoch boundary, the engine processes all accounts in pages. Trading and releases are paused until the rollover completes. Any user can advance the rollover from the Operations panel.</p> },
      ],
    },
    {
      slug: "pricing",
      title: "Index, perp and mark prices",
      summary: "Price sources, mark construction and availability conditions.",
      sections: [
        { id: "prices", title: "Price types", body: <Table rows={[
          ["Price", "Definition", "Used for"],
          ["Index", "300-second TWAP of an external reference: Polymarket for external events, the Kuru YES book for native events", "Market anchoring, funding, final-day checks"],
          ["Perp", "Impact mid of the Osyleum book, sampled by keepers; 60-second TWAP", "Mark construction"],
          ["Basis", "Perp minus index; 900-second TWAP", "Mark construction"],
          ["Mark", "Median of three estimates, clamped to a band around the index", "Margin, health, liquidation and P&L"],
        ]} /> },
        { id: "polymarket", title: "External reference", body: <p>For external events, Polymarket is used only as a price reference. Orders are not routed to Polymarket and its liquidity is not used; all trades match on Osyleum, against Osyleum liquidity and collateral. A price publisher fetches the source, validates it and publishes signed observations on chain.</p> },
        { id: "mark", title: "Mark construction", body: <>
          <Formula tex={String.raw`\begin{aligned}
\text{mark} &= \operatorname{median}\bigl(\text{index} + \text{basis}_{900},\; \text{perp}_{60},\; \text{live perp impact mid}\bigr) \\
\text{band} &= \text{index} \pm 0.05 \times \frac{T - t}{T - \text{listedAt}}
\end{aligned}`} />
          <p>The band narrows as resolution approaches, tightening the mark toward the external reference. The median prevents any single input from moving the mark alone.</p>
        </> },
        { id: "availability", title: "Availability", body: <>
          <p>All three inputs must be valid. An index sample is stale after 30 seconds, and any gap invalidates the affected window. While the mark is unavailable:</p>
          <ul>
            <li>health and margin estimates are paused;</li>
            <li>mark-based liquidation is suspended;</li>
            <li>collateral release is blocked;</li>
            <li>only fully backed orders within the index band are accepted.</li>
          </ul>
        </> },
        { id: "bootstrap", title: "Bootstrap mode", body: <p>Markets begin in <strong>bootstrap</strong> mode, which accepts only fully backed orders within the index band and disables leverage and funding. The market transitions to normal pricing at an epoch opening once all price windows are valid.</p> },
        { id: "circuit-breaker", title: "Circuit breaker", body: <p>A price movement greater than 0.10 within 300 seconds places the market in reduce-only mode.</p> },
      ],
    },
    {
      slug: "reserve",
      title: "Reserve",
      summary: "The per-market pool that backs leveraged positions, and liquidity provision.",
      sections: [
        { id: "overview", title: "Overview", body: <>
          <p>Each market has an isolated reserve held in a ReserveVault. The reserve absorbs leveraged losses that exceed trader collateral and earns jump premiums in return, as well as funding when it holds a position (for example after a takeover).</p>
          <p>The engine enforces, separately for each outcome, that the reserve covers the sum of all trader deficits plus the unspent funding budget:</p>
          <Formula tex={String.raw`R_y \ge \bar{D}_y + B \qquad \text{for } y \in \{\text{NO}, \text{YES}\}`} />
          <p>If both outcomes are covered, every INVALID settlement price between them is covered as well.</p>
        </> },
        { id: "seeding", title: "Seeding", body: <>
          <p>Liquidity providers seed the reserve from the <strong>Liquidity</strong> panel in Market details <strong>before activation</strong>. Each tUSDC seeded mints one share. A market supports a maximum of 256 shareholders.</p>
          <Note tone="warn">Share issuance closes at activation. Collateral sent to the reserve afterwards is treated as a donation and mints no shares. If activation occurs before a seed transaction confirms, the funds remain in the free vault.</Note>
        </> },
        { id: "redemption", title: "Redemption", body: <>
          <ol>
            <li><strong>Start withdrawal notice</strong> begins a seven-day notice on current shares. Shares added later require a new notice.</li>
            <li><strong>Prepare reserve payout</strong> becomes available once settlement is prepared and the notice has matured.</li>
            <li><strong>Claim prepared payout</strong> transfers the payout to the wallet.</li>
          </ol>
          <p>Reserve capital remains locked through settlement.</p>
        </> },
        { id: "risks", title: "Risks", body: <p>Reserve shares can lose value when leveraged traders on the losing side carry large deficits. Displayed reserve cash and coverage slack are not a redemption quote.</p> },
      ],
    },
  ],
};
