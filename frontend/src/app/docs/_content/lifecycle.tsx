import Link from "next/link";
import { Formula, Note, Table, type DocGroup } from "./kit";

export const lifecycle: DocGroup = {
  title: "Market lifecycle",
  pages: [
    {
      slug: "lifecycle",
      title: "Market lifecycle",
      summary: "The fixed schedule each market follows from activation to claims.",
      sections: [
        { id: "stages", title: "Stages", body: <>
          <p>Each market has a scheduled resolution time, <strong>T</strong>. The final day follows a fixed schedule relative to T:</p>
          <Table rows={[
            ["Stage", "Begins", "Rules"],
            ["Trading", "Activation", "Leverage up to the market cap; funding and premium accrue"],
            ["Final-day grace", "T − 12h 30m", "New exposure must be fully backed. Leveraged accounts must reach full backing before T − 12h"],
            ["Final-day floor", "T − 12h", "Accounts that are not fully backed are taken over by the reserve. Existing orders are invalidated; funding stops"],
            ["Reduce only", "T − 1h", "Only reductions and top-ups are accepted"],
            ["Halted", "T, or an accepted early halt", "Trading stops; keepers prepare settlement"],
            ["Claims ready", "Outcome final and payouts prepared", "Each account claims once"],
          ]} />
          <p>The <strong>Trading deadlines</strong> strip in the terminal counts down to the next stage.</p>
        </> },
        { id: "rationale", title: "Rationale", body: <p>At resolution, the price moves to 0 or 1 in a single block, leaving no opportunity for liquidation. Leverage must therefore be removed before that point. The full-backing check depends only on the account&apos;s two terminal values, not on a price, so the final-day floor is enforced even if the price feed is unavailable.</p> },
        { id: "floor", title: "Final-day floor", body: <Note tone="warn">
          <p>At <strong>T − 12h</strong>, the floor sweep transfers every account that is not fully backed to the reserve, regardless of its equity at the mark. The account&apos;s claim in the market becomes zero.</p>
          <p>Reach full backing during or before the grace window by topping up or reducing. The Backing floor guard <Link href="/docs/protection">protection rule</Link> can perform this automatically.</p>
        </Note> },
        { id: "states", title: "Additional market states", body: <Table rows={[
          ["State", "Description"],
          ["Epoch rollover", "Accounts are processed for a new funding epoch; trading and releases pause"],
          ["Monitor restriction", "The risk monitor or the price circuit breaker has placed the market in reduce-only mode"],
          ["Bootstrap", "The mark is not yet available; only fully backed orders within the index band are accepted"],
          ["Archived", "The market is no longer offered for new trading; reductions and claims remain available"],
        ]} /> },
        { id: "early-halt", title: "Early halt", body: <p>Events determined before T can be halted early by the oracle. From the halt onward, the market proceeds as if it had reached T.</p> },
      ],
    },
    {
      slug: "resolution",
      title: "Resolution",
      summary: "How outcomes are proposed, disputed and finalized by the ResolutionOracle.",
      sections: [
        { id: "layers", title: "Resolution layers", body: <>
          <p>After a market halts, the ResolutionOracle determines its outcome through three layers:</p>
          <Table rows={[
            ["Layer", "Mechanism", "Used when"],
            ["1. Data feeds", "A Chainlink CRE workflow reads the listed data source", "The market has a usable data feed"],
            ["2. Model panel and committee", "Three independent model families assess public evidence; a 2-of-3 human committee reviews", "No feed is available, the feed times out, or the models disagree"],
            ["3. Optimistic verification", "Proposals are posted as bonded assertions through UMA's optimistic oracle", "Every proposal from layers 1 and 2"],
          ]} />
          <p>Every proposal is bonded and can be disputed before it becomes final.</p>
          <Note>On testnet, layer 1 runs on a single simulation node rather than a Chainlink DON, and disputes are decided by the Olyseum team through a sandbox oracle rather than by UMA voters.</Note>
        </> },
        { id: "outcomes", title: "Outcomes", body: <Table rows={[
          ["Outcome", "Claim payout"],
          ["YES", "1"],
          ["NO", "0"],
          ["INVALID", "A captured market price between 0 and 1; see Settlement and claims"],
        ]} /> },
        { id: "disputes", title: "Proposals and disputes", body: <>
          <p>A proposal enters a <strong>challenge window</strong>. If no dispute is raised, the proposal becomes final. If disputed, the dispute is adjudicated and the losing party forfeits its bond.</p>
          <ul>
            <li>Each market allows a maximum of <strong>three attempts</strong>. A rejected outcome cannot be proposed again.</li>
            <li>After a rejection, the committee has a 24-hour exclusive window before proposals open to the public.</li>
            <li>If both YES and NO are rejected, the market is voided and settles as INVALID.</li>
          </ul>
        </> },
        { id: "participation", title: "Participation", body: <>
          <p>The <Link href="/resolution">Resolution</Link> page and each market&apos;s Resolution panel display the current state, proposed outcome, attempts used and evidence. Where permitted, any account can:</p>
          <Table rows={[
            ["Action", "Requirements"],
            ["Propose an outcome", "Market open to public proposals; evidence URL (HTTPS or IPFS, maximum 256 bytes); 32-byte evidence content hash; bond"],
            ["Dispute a proposal", "Live assertion within its challenge window; matching bond"],
            ["Advance the process", "None. Halt, request, escalate, finalize and similar steps are permissionless and have no effect when not yet due"],
          ]} />
          <Note tone="warn">Bonds are forfeited if the decision is adverse. The interface displays the exact bond and requires acknowledgement before posting.</Note>
        </> },
        { id: "void-deadline", title: "Void deadline", body: <p>Each halted market has a <strong>void deadline</strong>, shown on the Resolution page. A market with no final outcome by that time is voided and settles as INVALID, so every market reaches a final state.</p> },
        { id: "rules", title: "Resolution rules", body: <p>Each market publishes written resolution rules, available under <strong>Resolution rules</strong> on the Resolution page and in Market info in the terminal. The rules, not the question title, govern edge cases.</p> },
      ],
    },
    {
      slug: "settlement",
      title: "Settlement and claims",
      summary: "Settlement phases, payout calculation and claims.",
      sections: [
        { id: "phases", title: "Settlement phases", body: <>
          <Table rows={[
            ["Phase", "Description"],
            ["Halted, awaiting outcome", "Trading has stopped; resolution is in progress"],
            ["Outcome final, preparing balances", "Keepers process accounts in batches; any user can advance this from the Operations panel"],
            ["Claims ready", "A Claim action appears in the Balances panel"],
            ["Complete", "All claims have been paid"],
          ]} />
          <Note>A final oracle outcome does not make a payout claimable. Claims become available only when the market reports that claims are enabled.</Note>
        </> },
        { id: "payout", title: "Payout calculation", body: <>
          <p>The payout equals the account value at the settlement price, floored at zero (position in claims):</p>
          <Formula tex={String.raw`\begin{aligned}
&\text{YES:} && \text{payout} = \max(0,\ \text{cash} + \text{position}) \\
&\text{NO:} && \text{payout} = \max(0,\ \text{cash}) \\
&\text{INVALID:} && \text{payout} = \max(0,\ \text{cash} + \text{position} \times \text{settlement price})
\end{aligned}`} />
          <p>A leveraged account on the losing side receives zero; the reserve covers the shortfall.</p>
        </> },
        { id: "invalid", title: "INVALID settlement price", body: <p>For an INVALID outcome, the engine captures the market&apos;s time-weighted price over the 24 hours preceding T. Where the window is incomplete one hour after T, markets that disclosed a fallback settle at 0.5.</p> },
        { id: "claims", title: "Claims", body: <p>Each account claims once. The payout is transferred directly to the account owner&apos;s wallet and cannot be redirected. The Deliver settlement claim <Link href="/docs/protection">protection rule</Link> can submit the claim automatically.</p> },
        { id: "recovery", title: "Recovery state", body: <p>If settlement preparation fails a safety check, the market enters <strong>recovery required</strong> and claims remain disabled rather than paying incorrect amounts.</p> },
      ],
    },
  ],
};
