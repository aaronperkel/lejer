import { redirect } from "next/navigation";
import CalendarLinks from "@/app/components/CalendarLinks";
import DueChip from "@/app/components/DueChip";
import Pagination from "@/app/components/Pagination";
import { DownloadIcon, EyeIcon } from "@/app/components/icons";
import { requireUser } from "@/lib/auth";
import type { Bill } from "@/lib/bills";
import { hasFeature } from "@/lib/features";
import { fileHref } from "@/lib/files";
import { localDate } from "@/lib/time";
import { loadDashboard } from "@/lib/views";

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function dayMonth(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function byYear(bills: Bill[]): [string, Bill[]][] {
  const years = new Map<string, Bill[]>();
  for (const b of bills) years.set(b.billDate.slice(0, 4), [...(years.get(b.billDate.slice(0, 4)) ?? []), b]);
  return [...years.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

// The dashboard. Single-payer: the strip says what you owe the payer (or, for the payer, what
// the house owes them, and the ledger is hidden since it would only repeat that). Ledger mode:
// what you owe, plus who owes whom across the house.
export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const ctx = await requireUser();
  // First visit with the tour on (from login, the switcher or an invite): show it once.
  if (!ctx.demo && hasFeature(ctx.household, "welcomeTour") && !ctx.membership.welcomedAt) redirect("/welcome");
  const requested = Math.max(1, Number((await searchParams).page) || 1);
  const data = await loadDashboard(ctx, requested);
  if (data.page !== requested && data.totalBills > 0) redirect(`/?page=${data.page}`);

  const me = ctx.membership.id;
  // The viewer's own pairs first: what you owe, then what you're owed, then everyone else's.
  const mine = (p: (typeof data.pairs)[number]) => (p.debtorId === me ? 0 : p.ownerId === me ? 1 : 2);
  const pairs = [...data.pairs].sort((a, b) => mine(a) - mine(b));
  const owedToMe = data.pairs.filter((p) => p.ownerId === me);
  const iOweTo = [...new Set(data.pairs.filter((p) => p.debtorId === me).map((p) => p.owner ?? "the house"))];
  const names = (list: string[]) =>
    list.length === 1 ? list[0] : list.length <= 3 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : `${list.length} roommates`;
  const owedToMeTotal = Math.round(owedToMe.reduce((s, p) => s + p.amount * 100, 0)) / 100;
  const singlePayer = ctx.household.mode === "single_payer";
  const iAmPayer = singlePayer && data.ownsTypes;
  const myUnpaid = new Set(data.owed.billIds);
  const today = new Date(`${localDate(ctx.household.timezone)}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <main>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="page-title">Hi, {ctx.user.name}</h1>
          <p className="text-sm text-ink-muted">
            {ctx.household.name} as of {today}
          </p>
        </div>
        {data.calendarToken && (
          <div>
            <span className="sr-only">Add every due date to your calendar:</span>
            <CalendarLinks token={data.calendarToken} />
          </div>
        )}
      </div>

      <div className="panel mb-8 grid divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-4">
          {iAmPayer ? (
            <>
              <span className="eyebrow mb-1">Owed to you</span>
              <div className="figure text-[1.7rem] font-semibold leading-tight">${money(owedToMeTotal)}</div>
              <div className="mt-0.5 text-xs text-ink-muted">
                {owedToMe.length ? `from ${names(owedToMe.map((p) => p.debtor))}` : "everyone's paid you back"}
              </div>
            </>
          ) : (
            <>
              <span className="eyebrow mb-1">You owe</span>
              <div className="figure text-[1.7rem] font-semibold leading-tight">${money(data.owed.amount)}</div>
              <div className="mt-0.5 text-xs text-ink-muted">
                {!ctx.membership.splitsBills
                  ? "you don't split bills here"
                  : data.owed.billIds.length
                    ? `to ${names(iOweTo)}, across ${data.owed.billIds.length} unpaid ${data.owed.billIds.length === 1 ? "bill" : "bills"}`
                    : "all settled up"}
              </div>
              {/* Ledger mode: an owner is owed too, and that belongs in the first answer. */}
              {owedToMeTotal > 0 && (
                <div className="mt-1.5 text-xs text-ink-muted">
                  and you&apos;re owed <span className="figure font-semibold text-ink">${money(owedToMeTotal)}</span> from {names(owedToMe.map((p) => p.debtor))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="px-5 py-4">
          <span className="eyebrow mb-1">Next due</span>
          <div className="figure text-[1.7rem] font-semibold leading-tight">{data.owed.nextDue ? dayMonth(data.owed.nextDue.dueDate) : "—"}</div>
          <div className="mt-0.5 text-xs text-ink-muted">{data.owed.nextDue ? data.owed.nextDue.typeName : "nothing due from you"}</div>
        </div>
        <div className="px-5 py-4">
          <span className="eyebrow mb-1">Bills on record</span>
          <div className="figure text-[1.7rem] font-semibold leading-tight">{data.totalBills}</div>
          <div className="mt-0.5 text-xs text-ink-muted">{data.totalBills ? "in this household" : "none posted yet"}</div>
        </div>
      </div>

      {!iAmPayer && (
        <section className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <span className="eyebrow">The house ledger</span>
            <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
          </div>
          {data.pairs.length === 0 ? (
            <div className="panel px-5 py-4 text-sm text-ink-muted">Everyone&rsquo;s settled up. Nothing owed in the house.</div>
          ) : (
            <div className="panel divide-y divide-line-soft">
              {pairs.map((p) => (
                <div key={`${p.debtorId}->${p.ownerId ?? "house"}`} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm">
                  <span>
                    <strong className={p.debtorId === me ? "text-unpaid" : ""}>{p.debtorId === me ? "You" : p.debtor}</strong>{" "}
                    <span className="text-ink-muted">{p.debtorId === me ? "owe" : "owes"}</span>{" "}
                    <strong>{p.ownerId === me ? "you" : (p.owner ?? "the house")}</strong>
                  </span>
                  <span className="figure font-semibold">${money(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {data.bills.length === 0 ? (
        <div className="panel px-5 py-8 text-center text-sm text-ink-muted">No bills yet.</div>
      ) : (
        byYear(data.bills).map(([year, bills]) => (
          <section key={year} className="mb-7">
            <div className="mb-2 flex items-center gap-3">
              <span className="eyebrow">{year}</span>
              <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
            </div>
            <div className="panel overflow-x-auto">
              <table className="data-table table-stack table-stack-bills">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th className="num">Amount</th>
                    <th className="num">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => {
                    const iOwe = myUnpaid.has(bill.id);
                    const mine = bill.ownerId === me;
                    const href = bill.pdfPath ? fileHref(bill.pdfPath) : null;
                    // Non-splitters and owners see the bill's own state; debtors see theirs.
                    const own = ctx.membership.splitsBills && !mine;
                    return (
                      <tr key={bill.id}>
                        <td className="cell-bill">
                          <div className="font-medium">
                            {bill.typeEmoji} {bill.typeName}
                          </div>
                          <div className="figure text-xs text-ink-muted">
                            {dayMonth(bill.billDate)}
                            {!singlePayer && bill.ownerName ? ` · ${mine ? "yours" : `pay ${bill.ownerName}`}` : ""}
                          </div>
                        </td>
                        <td className="cell-due">
                          <DueChip due={bill.dueDate} paid={own ? !iOwe : bill.status === "paid"} />
                        </td>
                        <td className="cell-status">
                          {own ? (
                            <span className={`tag ${iOwe ? "tag-unpaid" : "tag-paid"}`}>{iOwe ? "Unpaid" : "Paid"}</span>
                          ) : (
                            <span className={`tag ${bill.status === "paid" ? "tag-paid" : "tag-unpaid"}`}>{bill.status === "paid" ? "Settled" : "Open"}</span>
                          )}
                        </td>
                        <td className="num cell-amount">
                          <div className="figure font-medium">${money(bill.total)}</div>
                          <div className="figure text-xs text-ink-muted">${money(bill.perPersonCost)} ea</div>
                        </td>
                        <td className="num cell-actions">
                          {href ? (
                            <div className="flex justify-end gap-1.5">
                              <a href={href} target="_blank" className="btn-icon" title="View bill" aria-label={`View ${bill.typeName} bill`}>
                                <EyeIcon />
                              </a>
                              <a href={href} download className="btn-icon" title="Download bill" aria-label={`Download ${bill.typeName} bill`}>
                                <DownloadIcon />
                              </a>
                            </div>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <Pagination currentPage={data.page} totalPages={data.totalPages} basePath="/" />
    </main>
  );
}
