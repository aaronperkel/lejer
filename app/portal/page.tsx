import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DueChip from "@/app/components/DueChip";
import Flash from "@/app/components/Flash";
import Pagination from "@/app/components/Pagination";
import { DownloadIcon, EyeIcon } from "@/app/components/icons";
import AddBillForm from "@/app/portal/AddBillForm";
import PaymentCheckboxes from "@/app/portal/PaymentCheckboxes";
import PortalTabs from "@/app/portal/PortalTabs";
import ReminderButton from "@/app/portal/ReminderButton";
import { requireUser } from "@/lib/auth";
import { fileHref } from "@/lib/files";
import { loadPortal } from "@/lib/views";

export const metadata: Metadata = { title: "Portal" };

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Everyone in the household can see this page. Admins manage every bill; a member manages
// (posts, marks payments, reminds) only bills of the types they own.
export default async function PortalPage({ searchParams }: PageProps<"/portal">) {
  const ctx = await requireUser();
  const sp = await searchParams;
  const requested = Math.max(1, Number(sp.page) || 1);
  const data = await loadPortal(ctx, requested);
  if (data.page !== requested && data.totalBills > 0) redirect(`/portal?page=${data.page}`);

  const isAdmin = ctx.membership.role === "admin";
  const manages = (ownerId: number | null) => isAdmin || (ownerId !== null && ownerId === ctx.membership.id);
  const ledger = ctx.household.mode === "ledger";

  return (
    <main>
      <PortalTabs active="bills" ctx={ctx} />
      <Flash ok={sp.ok} err={sp.err} />

      {data.pairs.length > 0 && (
        <section className="mb-7">
          <div className="mb-2 flex items-center gap-3">
            <span className="eyebrow">Still owed</span>
            <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
          </div>
          <div className="panel grid grid-cols-1 divide-y divide-line-soft sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:flex">
            {data.pairs.map((p) => (
              <div key={`${p.debtorId}->${p.ownerId ?? "house"}`} className="px-5 py-3 lg:flex-1">
                <span className="eyebrow mb-0.5">
                  {p.debtor} → {p.owner ?? "the house"}
                </span>
                <div className="figure font-semibold text-unpaid">${money(p.amount)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <AddBillForm
        types={data.types.filter((t) => manages(t.ownerId)).map(({ id, name, emoji, processingFee }) => ({ id, name, emoji, processingFee }))}
        splitterCount={data.splitters.length}
        askBillDate={ctx.household.askBillDate}
      />
      {data.types.length === 0 && (
        <p className="mb-5 text-sm text-ink-muted">
          {isAdmin ? "Add a bill type on the Household tab first (Gas, Electric, …)." : "No bill types yet. An admin adds them on the Household tab."}
        </p>
      )}

      <div className="panel overflow-x-auto">
        <table className="data-table table-stack table-stack-owes">
          <thead>
            <tr>
              <th>Bill</th>
              <th>Due</th>
              <th>Status</th>
              <th>Paid back</th>
              <th className="num">Amount</th>
              <th className="num">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.bills.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-ink-muted">No bills yet.</td>
              </tr>
            ) : (
              data.bills.map((bill) => {
                const debts = data.debts[bill.id] ?? [];
                const canManage = manages(bill.ownerId);
                const href = bill.pdfPath ? fileHref(bill.pdfPath) : null;
                return (
                  <tr key={bill.id}>
                    <td className="cell-bill">
                      <div className="font-medium">
                        {bill.typeEmoji} {bill.typeName}
                      </div>
                      <div className="figure text-xs text-ink-muted">
                        {shortDate(bill.billDate)}
                        {ledger && bill.ownerName ? ` · ${bill.ownerName}'s account` : ""}
                      </div>
                    </td>
                    <td className="cell-due">
                      <DueChip due={bill.dueDate} paid={bill.status === "paid"} />
                    </td>
                    <td className="cell-status">
                      <span className={`tag ${bill.status === "paid" ? "tag-paid" : "tag-unpaid"}`}>{bill.status === "paid" ? "Settled" : "Open"}</span>
                    </td>
                    <td className="cell-owes">
                      <span className="eyebrow mb-1.5 sm:hidden">Paid {bill.ownerName ?? "back"}</span>
                      {debts.length > 0 ? <PaymentCheckboxes billId={bill.id} debts={debts} canEdit={canManage && !ctx.demo} /> : <span className="text-ink-muted">Nobody owes</span>}
                    </td>
                    <td className="num cell-amount">
                      <div className="figure font-medium">${money(bill.total)}</div>
                      <div className="figure text-xs text-ink-muted">${money(bill.perPersonCost)} ea</div>
                    </td>
                    <td className="num cell-actions">
                      <div className="flex justify-end gap-1.5">
                        {href && (
                          <>
                            <a href={href} target="_blank" className="btn-icon" title="View bill" aria-label={`View ${bill.typeName} bill`}>
                              <EyeIcon />
                            </a>
                            <a href={href} download className="btn-icon" title="Download bill" aria-label={`Download ${bill.typeName} bill`}>
                              <DownloadIcon />
                            </a>
                          </>
                        )}
                        {canManage && bill.status !== "paid" && <ReminderButton billId={bill.id} />}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination currentPage={data.page} totalPages={data.totalPages} basePath="/portal" />
    </main>
  );
}
