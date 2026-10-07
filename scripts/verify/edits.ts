// Fixing a posted bill (0005), library level: the 10-minute new-bill email queue, edits over the
// frozen split set, deletes, the paid lock, who may do it, and the net ledger. Every send goes
// through a recording Mailer; the flush runs with simulated clocks for fixture households only.

import { LOCKED_BILL, type OwedPair, createBill, deleteBill, getDebts, netPairs, saveBillType, setPaid, updateBill } from "@/lib/bills";
import type { Ctx } from "@/lib/context";
import { tickHousehold } from "@/lib/cron";
import { withHousehold } from "@/lib/db";
import { demoCtx } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { NOTICE_DELAY_MINUTES, flushBillNotices, sendBillRemoved } from "@/lib/notices";
import { RUN, type Results, type Sql, addMember, ctxFor, makeHousehold, recorder } from "./harness";

const billOn = "2030-03-01";
const due = "2030-03-20";

export async function edits(r: Results, { owner }: { owner: Sql }) {
  const refused = async (name: string, fn: () => Promise<unknown>, re: RegExp) =>
    r.throws(name, async () => {
      try {
        await fn();
      } catch (e) {
        if (!(e instanceof ActionError)) throw new Error(`not an ActionError: ${e instanceof Error ? e.message : e}`);
        throw e;
      }
    }, re);

  const h = await makeHousehold(owner, "ed", "ledger");
  const hid = h.id;
  await owner`DELETE FROM payment_thanks WHERE household_id = ${hid}`;
  const third = await addMember(owner, h, `ed-third-${RUN}`);
  const pending = await addMember(owner, h, `ed-pending-${RUN}`, { joined: false });
  const emailOf = async (userId: number) => (await owner<{ email: string }[]>`SELECT email FROM users WHERE id = ${userId}`)[0].email;
  const adminEmail = await emailOf(h.admin.userId);
  let admin: Ctx = await ctxFor(h.admin.userId, hid);
  const member: Ctx = await ctxFor(h.member.userId, hid);
  const tx = <T>(ctx: Ctx, fn: Parameters<typeof withHousehold<T>>[1]) => withHousehold(ctx, fn);
  const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);
  const flush = async (minutes: number, opts: { fail?: boolean; gate?: Promise<void>; entered?: () => void } = {}) => {
    const rec = recorder({ fail: opts.fail ? () => true : undefined, gate: opts.gate, entered: opts.entered });
    const res = await flushBillNotices(await ctxFor(h.admin.userId, hid), { now: later(minutes), mailer: rec.mailer });
    return { ...res, sent: rec.sent, failedSends: rec.failed };
  };
  const notice = async (billId: number) =>
    (await owner<{ kind: string | null; queuedAt: Date | null; notified: boolean; extra: number[] }[]>`
      SELECT notice_kind AS kind, notice_queued_at AS "queuedAt", notified_at IS NOT NULL AS notified, notice_extra AS extra
      FROM bills WHERE id = ${billId}`)[0];
  const debtorsOf = async (billId: number) => ((await tx(admin, (t) => getDebts(t, [billId]))).get(billId) ?? []).map((d) => d.personId).sort((a, b) => a - b);
  const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);
  const post = (ctx: Ctx, typeId: number, amount: number) => tx(ctx, (t) => createBill(t, ctx, { typeId, amount, billDate: billOn, dueDate: due }));
  const edit = (ctx: Ctx, billId: number, typeId: number, amount: number) => tx(ctx, (t) => updateBill(t, ctx, billId, { typeId, amount, billDate: billOn, dueDate: due }));

  // ---------------------------------------------------------------------------------------------
  r.section(`edits: the new-bill email waits ${NOTICE_DELAY_MINUTES} minutes`);
  await owner`UPDATE households SET digest_email = ${`digest-${hid}@verify.invalid`} WHERE id = ${hid}`;
  const b1 = await post(admin, h.typeId, 120); // 4 shares (admin, member, third, the pending invite): 30 each
  let n = await notice(b1.billId);
  r.check("posting queues a 'new' email and marks nothing sent", n.kind === "new" && n.queuedAt !== null && !n.notified, n);
  let f = await flush(NOTICE_DELAY_MINUTES - 1);
  r.check(`a flush ${NOTICE_DELAY_MINUTES - 1} minutes later sends nothing`, f.sent.length === 0 && f.pending >= 1, f);
  f = await flush(NOTICE_DELAY_MINUTES + 1);
  const bills1 = f.sent.filter((s) => s.kind === "new_bill");
  r.check(`${NOTICE_DELAY_MINUTES + 1} minutes later: one email each to the owner and the two joined debtors, none to the pending invite`,
    bills1.length === 3 && bills1.every((s) => s.subject.includes("$30.00") && s.replyTo === adminEmail) && !bills1.some((s) => s.to.includes("ed-pending")), bills1);
  r.check("…plus the digest copy", f.sent.filter((s) => s.kind === "digest").length === 1 && /^Posted: Gas, emailed 3/.test(f.sent.find((s) => s.kind === "digest")?.subject ?? ""), f.sent);
  n = await notice(b1.billId);
  r.check("…and the bill is marked emailed, with nothing left queued", n.notified && n.kind === null);
  r.check("a second flush sends nothing more", (await flush(NOTICE_DELAY_MINUTES + 1)).sent.length === 0);
  await owner`UPDATE households SET digest_email = NULL WHERE id = ${hid}`;
  admin = await ctxFor(h.admin.userId, hid);

  // ---------------------------------------------------------------------------------------------
  r.section("edits: an edit re-queues rather than double-sends");
  const b2 = await post(member, h.memberTypeId, 80); // member owns Water: 20 each
  const firstQueued = (await notice(b2.billId)).queuedAt!;
  await new Promise((res) => setTimeout(res, 20));
  await edit(member, b2.billId, h.memberTypeId, 90);
  await edit(member, b2.billId, h.memberTypeId, 100);
  n = await notice(b2.billId);
  r.check("an edit inside the window restarts it (still a 'new' email)", n.kind === "new" && n.queuedAt!.getTime() > firstQueued.getTime(), n);
  f = await flush(NOTICE_DELAY_MINUTES + 1);
  r.check("two quick edits, one round of email with the final figures ($25.00, never $20 or $22.50)",
    f.sent.length === 3 && f.sent.every((s) => s.kind === "new_bill" && s.subject.includes("$25.00")), f.sent);
  await edit(admin, b1.billId, h.typeId, 160);
  n = await notice(b1.billId);
  r.check("an edit after the email went out queues an 'updated' email", n.kind === "updated" && n.queuedAt !== null, n);
  r.check(`…held for ${NOTICE_DELAY_MINUTES} minutes too`, (await flush(NOTICE_DELAY_MINUTES - 1)).sent.length === 0);
  f = await flush(NOTICE_DELAY_MINUTES + 1);
  r.check("…then exactly one round of corrections ($40.00 each)", f.sent.length === 3 && f.sent.every((s) => s.kind === "bill_updated" && s.subject.startsWith("Corrected") && s.subject.includes("$40.00")), f.sent);
  r.check("…and nothing after that", (await flush(NOTICE_DELAY_MINUTES + 1)).sent.length === 0);

  // ---------------------------------------------------------------------------------------------
  r.section("edits: the split set is frozen at post time");
  const b3 = await post(admin, h.typeId, 40); // admin owns Gas; debtors member, third, pending; 10 each
  const late = await addMember(owner, h, `ed-late-${RUN}`);
  await owner`UPDATE bills SET created_at = now() - interval '30 days' WHERE id = ${b3.billId}`; // posted weeks ago
  await edit(admin, b3.billId, h.typeId, 60);
  const [row3] = await owner<{ total: string; per: string; shares: number }[]>`SELECT total, per_person_cost AS per, shares FROM bills WHERE id = ${b3.billId}`;
  r.check("an amount edit recomputes over the same 4 shares (60 → 15.00 each)", Number(row3.total) === 60 && Number(row3.per) === 15 && row3.shares === 4, row3);
  r.check("a member who joined after the post is still not a debtor after an edit, even weeks later",
    !(await debtorsOf(b3.billId)).includes(late.membershipId) && (await debtorsOf(b3.billId)).length === 3);
  await edit(admin, b3.billId, h.memberTypeId, 60);
  const [moved] = await owner<{ ownerId: number; per: string }[]>`SELECT owner_id AS "ownerId", per_person_cost AS per FROM bills WHERE id = ${b3.billId}`;
  r.check("changing the type re-snapshots the owner from the new type", moved.ownerId === h.member.membershipId, moved);
  r.check("…the new owner stops owing, the old owner (who held a share) starts, same set size",
    JSON.stringify(await debtorsOf(b3.billId)) === JSON.stringify(sorted([h.admin.membershipId, third.membershipId, pending.membershipId])) && Number(moved.per) === 15);
  const shared = await tx(admin, (t) => saveBillType(t, admin, { name: `Shared ${RUN}`, emoji: "🏠", processingFee: 2, ownerId: null }));
  await edit(admin, b3.billId, shared.id, 60);
  const [house] = await owner<{ ownerId: number | null; total: string; per: string; fee: string }[]>`
    SELECT owner_id AS "ownerId", total, per_person_cost AS per, fee FROM bills WHERE id = ${b3.billId}`;
  r.check("a type with no owner: everyone in the set owes (4 rows), with that type's fee (62 → 15.50)",
    house.ownerId === null && (await debtorsOf(b3.billId)).length === 4 && Number(house.total) === 62 && Number(house.per) === 15.5 && Number(house.fee) === 2, house);
  r.check("…the late joiner still isn't on it", !(await debtorsOf(b3.billId)).includes(late.membershipId));

  // A former owner who didn't split is the one person an edit can drop: they hear about it.
  const landlord = await addMember(owner, h, `ed-landlord-${RUN}`, { splits: false });
  const rent = await tx(admin, (t) => saveBillType(t, admin, { name: `Rent ${RUN}`, emoji: "🔑", processingFee: 0, ownerId: landlord.membershipId }));
  const b4 = await post(admin, rent.id, 100); // 5 splitters now (late joined), landlord holds no share: 20 each
  await flush(NOTICE_DELAY_MINUTES + 1);
  await edit(admin, b4.billId, h.typeId, 100);
  f = await flush(NOTICE_DELAY_MINUTES + 1);
  const landlordEmail = await emailOf(landlord.userId);
  r.check("the updated email reaches the debtors before and after plus both owners (the dropped landlord told they're off it)",
    f.sent.some((s) => s.to === landlordEmail && /no longer on it/.test(s.subject)) && f.sent.some((s) => s.to === adminEmail && /owed to you/.test(s.subject)) && f.sent.length === 5,
    f.sent.map((s) => `${s.to.split("@")[0]}: ${s.subject}`));

  // ---------------------------------------------------------------------------------------------
  r.section("edits: deleting a bill");
  const b5 = await post(admin, h.typeId, 50);
  const gone = await tx(admin, (t) => deleteBill(t, admin, b5.billId));
  r.check("inside the window: the bill is gone and nobody had been emailed", !gone.notified && (await owner`SELECT 1 FROM bills WHERE id = ${b5.billId}`).length === 0);
  r.check("…so the flush has nothing to send for it", (await flush(NOTICE_DELAY_MINUTES + 1)).sent.length === 0);
  const removed = await tx(admin, (t) => deleteBill(t, admin, b2.billId)); // emailed earlier
  const rec = recorder();
  const told = await sendBillRemoved(admin, removed, { mailer: rec.mailer });
  r.check("after the email went out: a removal note to the joined debtors and the owner",
    removed.notified && told.sent === 3 && rec.sent.every((s) => s.kind === "bill_removed" && s.subject.startsWith("Removed")), rec.sent);
  r.check("…and no note at all for a bill nobody had heard of", (await sendBillRemoved(admin, gone, { mailer: recorder().mailer })).sent === 0);

  // ---------------------------------------------------------------------------------------------
  r.section("edits: locked once anyone is marked paid");
  const b6 = await post(admin, h.typeId, 40);
  await tx(admin, (t) => setPaid(t, admin, b6.billId, h.member.membershipId, true));
  await refused("an edit is refused once someone is marked paid", () => edit(admin, b6.billId, h.typeId, 44), new RegExp(LOCKED_BILL.slice(0, 30)));
  await refused("…and so is a delete", () => tx(admin, (t) => deleteBill(t, admin, b6.billId)), /already been marked paid/);
  await tx(admin, (t) => setPaid(t, admin, b6.billId, h.member.membershipId, false));
  await edit(admin, b6.billId, h.typeId, 44);
  r.check("unchecked again, it can be edited", Number((await owner<{ t: string }[]>`SELECT total AS t FROM bills WHERE id = ${b6.billId}`)[0].t) === 44);

  // ---------------------------------------------------------------------------------------------
  r.section("edits: who may edit");
  await refused("a member can't edit a bill someone else owns", () => edit(member, b6.billId, h.typeId, 10), /types you own/);
  await refused("…nor delete it", () => tx(member, (t) => deleteBill(t, member, b6.billId)), /types you own/);
  const own = await post(member, h.memberTypeId, 30);
  await edit(member, own.billId, h.memberTypeId, 36);
  r.check("a member edits a bill they own", Number((await owner<{ t: string }[]>`SELECT total AS t FROM bills WHERE id = ${own.billId}`)[0].t) === 36);
  await refused("…but can't move it to a type they don't own", () => edit(member, own.billId, h.typeId, 36), /types you own/);
  await refused("the demo is refused", () => updateBill(null as never, demoCtx(), 1, { typeId: 1, amount: 1, billDate: billOn, dueDate: due }), /read-only/);

  // ---------------------------------------------------------------------------------------------
  r.section("edits: failures and re-queues");
  await flush(NOTICE_DELAY_MINUTES + 1); // clear anything due
  const b7 = await post(admin, h.typeId, 20);
  const queued7 = (await notice(b7.billId)).queuedAt!;
  f = await flush(NOTICE_DELAY_MINUTES + 1, { fail: true });
  n = await notice(b7.billId);
  r.check("every send failed → back in the queue as it was (not marked emailed)",
    f.failedSends.length === 4 && n.kind === "new" && n.queuedAt?.getTime() === queued7.getTime() && !n.notified, { n, failed: f.failedSends.length });
  let open!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((res) => (open = res));
  const inSend = new Promise<void>((res) => (entered = res));
  const slow = flush(NOTICE_DELAY_MINUTES + 1, { fail: true, gate, entered });
  await inSend; // claimed, stuck sending
  await edit(admin, b7.billId, h.typeId, 24);
  open();
  await slow;
  n = await notice(b7.billId);
  r.check("an edit made while a failing send was in flight wins (its re-queue stays)", n.kind !== null && n.queuedAt!.getTime() > queued7.getTime(), n);

  // ---------------------------------------------------------------------------------------------
  r.section("edits: the hourly tick flushes the queue");
  await owner`UPDATE households SET reminders_enabled = false WHERE id = ${hid}`;
  const tickRec = recorder();
  const t = await tickHousehold(hid, { now: later(NOTICE_DELAY_MINUTES + 1), mailer: tickRec.mailer });
  r.check("even with reminders off, the tick sends what has waited out its window", t.notices.sent > 0 && t.skipped === "reminders off" && (await notice(b7.billId)).kind === null, t.notices);

  // ---------------------------------------------------------------------------------------------
  r.section("edits: the net ledger (pure)");
  const pair = (debtorId: number, ownerId: number | null, amount: number, owner: string | null = `P${ownerId}`): OwedPair => ({ debtorId, debtor: `P${debtorId}`, ownerId, owner, amount });
  let net = netPairs([pair(1, 2, 30), pair(2, 1, 12)]);
  r.check("$30 one way, $12 back → one row, $18 the right way round, with the gross amounts",
    net.length === 1 && net[0].debtorId === 1 && net[0].ownerId === 2 && net[0].amount === 18 && net[0].gross?.owed === 30 && net[0].gross?.offset === 12, net);
  net = netPairs([pair(1, 2, 12), pair(2, 1, 30)]);
  r.check("…and the other way round", net.length === 1 && net[0].debtorId === 2 && net[0].amount === 18, net);
  r.check("an even pair drops out", netPairs([pair(1, 2, 25.5), pair(2, 1, 25.5)]).length === 0);
  r.check("cents stay exact (0.30 − 0.10 = 0.20)", netPairs([pair(1, 2, 0.3), pair(2, 1, 0.1)])[0].amount === 0.2);
  net = netPairs([pair(1, null, 10, null), pair(3, null, 5, "former member"), pair(1, 2, 7)]);
  r.check("the house and a former member pass through; a one-way pair has no gross", net.length === 3 && net.every((p) => p.gross === null) && net[0].amount === 10, net);
}
