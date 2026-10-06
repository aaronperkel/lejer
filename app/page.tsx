import { requireUser } from "@/lib/auth";
import { withHousehold } from "@/lib/db";
import { DEMO_BILL_TYPES, DEMO_BILLS, DEMO_DEBTS, DEMO_PEOPLE } from "@/lib/demo";

// Placeholder: proves request → ctx → withHousehold → RLS end to end (and the demo branch).
// The real dashboard replaces this in phase 3.
export default async function Home() {
  const ctx = await requireUser();

  const { members, types, bills } = ctx.demo
    ? {
        members: DEMO_PEOPLE,
        types: DEMO_BILL_TYPES,
        bills: DEMO_BILLS.map((b) => ({ ...b, debtors: DEMO_DEBTS.get(b.id)?.size ?? 0 })),
      }
    : await withHousehold(ctx, async (tx) => ({
        members: await tx<{ id: number; name: string; role: string; splitsBills: boolean }[]>`
          SELECT m.id, u.name, m.role, m.splits_bills AS "splitsBills"
          FROM memberships m JOIN users u ON u.id = m.user_id
          WHERE m.household_id = ${ctx.household.id} -- memberships_read also admits my rows elsewhere
          ORDER BY m.id`,
        types: await tx<{ id: number; name: string; emoji: string; processingFee: number; ownerName: string | null }[]>`
          SELECT bt.id, bt.name, bt.emoji, bt.processing_fee AS "processingFee", ou.name AS "ownerName"
          FROM bill_types bt
          LEFT JOIN memberships om ON om.id = bt.owner_id
          LEFT JOIN users ou ON ou.id = om.user_id
          ORDER BY bt.name`,
        bills: await tx<{ id: number; typeName: string; dueDate: string; total: number; perPersonCost: number; status: string; debtors: number }[]>`
          SELECT b.id, bt.name AS "typeName", b.due_date AS "dueDate", b.total,
                 b.per_person_cost AS "perPersonCost", b.status, count(d.person_id) AS debtors
          FROM bills b
          JOIN bill_types bt ON bt.id = b.type_id
          LEFT JOIN bill_debts d ON d.bill_id = b.id
          GROUP BY b.id, bt.name
          ORDER BY b.due_date DESC`,
      }));

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8 font-mono text-sm">
      <header>
        <h1 className="text-lg font-semibold">{ctx.household.name}</h1>
        <p>
          {ctx.household.mode} · {ctx.household.theme} · {ctx.household.timezone} · signed in as{" "}
          {ctx.user.name} ({ctx.membership.role})
        </p>
      </header>

      <section>
        <h2 className="font-semibold">Members</h2>
        <ul>
          {members.map((m) => (
            <li key={m.id}>
              {m.name} — {m.role}
              {m.splitsBills ? "" : " (does not split)"}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold">Bill types</h2>
        <ul>
          {types.map((t) => (
            <li key={t.id}>
              {t.emoji} {t.name} — owner {t.ownerName ?? "none"}
              {t.processingFee ? `, fee $${t.processingFee.toFixed(2)}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold">Bills</h2>
        <ul>
          {bills.map((b) => (
            <li key={b.id}>
              {b.dueDate} {b.typeName} ${b.total.toFixed(2)} (${b.perPersonCost.toFixed(2)} each) —{" "}
              {b.status}, {b.debtors} still owe
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
