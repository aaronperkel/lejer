// Phase 3 (core ledger), library level: who may post and mark payments, split math, the fixed
// debtor set (0003: rows are permanent, paid_at toggles), status flips, the thanks queue, bill
// types, and /files authorization. Mutations run through the same lib functions the actions
// call, with real contexts built from fixture memberships.

import {
  FORMER_MEMBER,
  computeSplit,
  createBill,
  getBill,
  getDebts,
  getMyBalance,
  getOwedPairs,
  parseAmount,
  prepareBill,
  refreshBillStatus,
  removeBillType,
  saveBillType,
  setPaid,
} from "@/lib/bills";
import { billPdfKey } from "@/lib/blob";
import type { Ctx } from "@/lib/context";
import { withHousehold } from "@/lib/db";
import { demoCtx } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { authorizeFile } from "@/lib/files";
import { RUN, type Results, type Sql, addMember, ctxFor, makeHousehold } from "./harness";

const due = "2030-01-15";
const billOn = "2030-01-01";

export async function bills(r: Results, { owner }: { owner: Sql }) {
  const refused = async (name: string, fn: () => Promise<unknown>, re = /./) =>
    r.throws(name, async () => {
      try {
        await fn();
      } catch (e) {
        if (!(e instanceof ActionError)) throw new Error(`not an ActionError: ${e instanceof Error ? e.message : e}`);
        throw e;
      }
    }, re);
  const tx = <T>(ctx: Ctx, fn: Parameters<typeof withHousehold<T>>[1]) => withHousehold(ctx, fn);

  r.section("bills: split math (pure)");
  let s = computeSplit({ amount: 100, fee: 0, splitterIds: [1, 2, 3], ownerId: 1 });
  r.check("100 over 3 → 33.33 each, owner excluded from debtors", s.total === 100 && s.perPersonCost === 33.33 && s.debtorIds.join() === "2,3", s);
  s = computeSplit({ amount: 100, fee: 3.5, splitterIds: [1, 2, 3], ownerId: 1 });
  r.check("fee is added before splitting: 103.50 → 34.50", s.total === 103.5 && s.perPersonCost === 34.5, s);
  s = computeSplit({ amount: 0.1, fee: 0.2, splitterIds: [1, 2], ownerId: 1 });
  r.check("cents math: 0.10 + 0.20 = 0.30, 0.15 each", s.total === 0.3 && s.perPersonCost === 0.15, s);
  s = computeSplit({ amount: 50, fee: 0, splitterIds: [1, 2], ownerId: null });
  r.check("no owner → every splitter owes", s.debtorIds.join() === "1,2" && s.perPersonCost === 25);
  s = computeSplit({ amount: 90, fee: 0, splitterIds: [2, 3, 4], ownerId: 9 });
  r.check("owner who doesn't split: not in the denominator, everyone owes", s.perPersonCost === 30 && s.debtorIds.length === 3);
  r.check("parseAmount accepts 84.2, $1,204.50; rejects 0, -5, 1.234, abc",
    parseAmount("84.2") === 84.2 && parseAmount("$1,204.50") === 1204.5 && [0, "-5", "1.234", "abc", ""].every((x) => parseAmount(x) === null));
  r.check("bill PDF key: h/{id}/bills/{year}/{type-slug}/{MMDD}-{billId}.pdf", billPdfKey(7, "Gas & Electric", "2026-06-23", 42) === "h/7/bills/2026/gas-electric/0623-42.pdf");

  r.section("bills: single-payer split on a real household");
  const sp = await makeHousehold(owner, "sp", "single_payer");
  const third = await addMember(owner, sp, `sp-third-${RUN}`);
  const lurker = await addMember(owner, sp, `sp-lurker-${RUN}`, { splits: false });
  const spAdmin = await ctxFor(sp.admin.userId, sp.id);
  await owner`UPDATE bill_types SET processing_fee = 3.50 WHERE id = ${sp.typeId}`;
  const spBill = await tx(spAdmin, (t) => createBill(t, spAdmin, { typeId: sp.typeId, amount: 100, billDate: billOn, dueDate: due }));
  r.check("payer's bill: 103.50 total, 34.50 each over 3 splitters", spBill.total === 103.5 && spBill.perPersonCost === 34.5, spBill);
  const spDebtors = spBill.debtors.map((d) => d.id).sort();
  r.check("debtors are the two other splitters (not the payer, not the non-splitter)",
    spDebtors.join() === [sp.member.membershipId, third.membershipId].sort().join() && !spDebtors.includes(lurker.membershipId));
  const [stored] = await owner<{ total: string; per: string; status: string; addedBy: number }[]>`
    SELECT total, per_person_cost AS per, status, added_by_id AS "addedBy" FROM bills WHERE id = ${spBill.billId}`;
  r.check("stored as posted (NUMERIC 103.50 / 34.50, unpaid, added_by = poster)",
    Number(stored.total) === 103.5 && Number(stored.per) === 34.5 && stored.status === "unpaid" && stored.addedBy === sp.admin.membershipId, stored);
  const typeEdit = await tx(spAdmin, (t) => saveBillType(t, spAdmin, { name: `Internet ${RUN}`, emoji: "🛜", processingFee: 0, ownerId: sp.member.membershipId }));
  r.check("single_payer: a new type's owner is the payer, whatever the form says", typeEdit.ownerId === sp.admin.membershipId, typeEdit);

  r.section("bills: ledger member may only manage types they own");
  const lg = await makeHousehold(owner, "lg", "ledger");
  const late = { membershipId: 0 };
  const admin = await ctxFor(lg.admin.userId, lg.id);
  const member = await ctxFor(lg.member.userId, lg.id);
  const ownBill = await tx(member, (t) => createBill(t, member, { typeId: lg.memberTypeId, amount: 60, billDate: billOn, dueDate: due }));
  r.check("member posts a bill for the type they own", ownBill.billId > 0 && ownBill.debtors.map((d) => d.id).join() === String(lg.admin.membershipId));
  await refused("member cannot post for a type someone else owns", () => tx(member, (t) => createBill(t, member, { typeId: lg.typeId, amount: 60, billDate: billOn, dueDate: due })), /types you own/);
  await refused("…nor reserve a bill id for one (prepareBill)", () => tx(member, (t) => prepareBill(t, member, { typeId: lg.typeId, amount: 60, billDate: billOn, dueDate: due })), /types you own/);
  await refused("member cannot mark payments on another owner's bill", () => tx(member, (t) => setPaid(t, member, lg.billId, lg.member.membershipId, true)), /types you own/);
  const ownStatus = await tx(member, (t) => setPaid(t, member, ownBill.billId, lg.admin.membershipId, true));
  r.check("member marks payments on their own type's bill", ownStatus === "paid");
  await refused("member cannot add bill types", () => tx(member, (t) => saveBillType(t, member, { name: "Nope", emoji: "❌", processingFee: 0, ownerId: null })), /admin/);
  await refused("member cannot remove bill types", () => tx(member, (t) => removeBillType(t, member, lg.memberTypeId)), /admin/);
  const adminBill = await tx(admin, (t) => createBill(t, admin, { typeId: lg.memberTypeId, amount: 30, billDate: billOn, dueDate: due }));
  r.check("admin may post for any type (debts still run to the type's owner)", adminBill.debtors.map((d) => d.id).join() === String(lg.admin.membershipId));
  const demo = demoCtx();
  await refused("the demo context is refused", () => setPaid(null as never, demo, 1, 1, true), /read-only/);
  await refused("bad input is an ActionError, not a crash", () => tx(admin, (t) => createBill(t, admin, { typeId: lg.typeId, amount: 60, billDate: "2030-02-30", dueDate: due })), /date/);

  r.section("bills: fixed debtor set, paid_at, status flips");
  const roomie = await addMember(owner, lg, `lg-roomie-${RUN}`);
  const twoDebtors = await tx(admin, (t) => createBill(t, admin, { typeId: lg.typeId, amount: 90, billDate: billOn, dueDate: due }));
  const ids = twoDebtors.debtors.map((d) => d.id).sort((a, b) => a - b);
  r.check("bill posted with two debtors (member, roomie), 30.00 each", ids.join() === [lg.member.membershipId, roomie.membershipId].sort((a, b) => a - b).join() && twoDebtors.perPersonCost === 30);
  const lateJoiner = await addMember(owner, lg, `lg-late-${RUN}`);
  late.membershipId = lateJoiner.membershipId;
  let st = await tx(admin, (t) => setPaid(t, admin, twoDebtors.billId, lg.member.membershipId, true));
  r.check("first of two pays → still unpaid", st === "unpaid");
  st = await tx(admin, (t) => setPaid(t, admin, twoDebtors.billId, roomie.membershipId, true));
  r.check("last unpaid row paid → bill flips to paid", st === "paid");
  const [{ status: dbStatus }] = await owner<{ status: string }[]>`SELECT status FROM bills WHERE id = ${twoDebtors.billId}`;
  r.check("…and bills.status says paid in the database", dbStatus === "paid");
  const rowsPaid = await owner<{ n: number; paid: number }[]>`
    SELECT count(*)::int AS n, count(paid_at)::int AS paid FROM bill_debts WHERE bill_id = ${twoDebtors.billId}`;
  r.check("rows are kept when paid (2 rows, both with paid_at)", rowsPaid[0].n === 2 && rowsPaid[0].paid === 2, rowsPaid[0]);
  st = await tx(admin, (t) => setPaid(t, admin, twoDebtors.billId, roomie.membershipId, false));
  r.check("unchecking flips the bill back to unpaid", st === "unpaid");
  const after = (await tx(admin, (t) => getDebts(t, [twoDebtors.billId]))).get(twoDebtors.billId)!;
  r.check("unchecking restores exactly the original debtor (same two people, roomie unpaid)",
    after.map((d) => d.personId).sort((a, b) => a - b).join() === ids.join() && after.find((d) => d.personId === roomie.membershipId)?.paid === false && after.find((d) => d.personId === lg.member.membershipId)?.paid === true);
  await refused("a member who joined after the bill can't be marked on it", () => tx(admin, (t) => setPaid(t, admin, twoDebtors.billId, late.membershipId, true)), /doesn't owe/);
  await refused("…nor un-marked (no row appears either way)", () => tx(admin, (t) => setPaid(t, admin, twoDebtors.billId, late.membershipId, false)), /doesn't owe/);
  const [{ n: lateRows }] = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM bill_debts WHERE person_id = ${late.membershipId} AND bill_id = ${twoDebtors.billId}`;
  r.check("the late joiner has no row on the old bill", lateRows === 0);
  const newer = await tx(admin, (t) => createBill(t, admin, { typeId: lg.typeId, amount: 90, billDate: billOn, dueDate: due }));
  r.check("…but is a debtor on bills posted after they joined (90 / 4 = 22.50)", newer.debtors.some((d) => d.id === late.membershipId) && newer.perPersonCost === 22.5);

  const balance = await tx(member, (t) => getMyBalance(t, lg.member.membershipId));
  const pairs = await tx(admin, (t) => getOwedPairs(t));
  const memberToAdmin = pairs.find((p) => p.debtorId === lg.member.membershipId && p.ownerId === lg.admin.membershipId);
  r.check("balance counts only unpaid rows (fixture 40 + newer 22.50 = 62.50)", balance.amount === 62.5 && balance.billIds.length === 2, balance);
  r.check("owed pairs agree with the balance", memberToAdmin?.amount === 62.5, memberToAdmin);
  r.check("paid rows don't appear in owed pairs (roomie owes only the reopened 30 + 22.50)", pairs.find((p) => p.debtorId === roomie.membershipId)?.amount === 52.5);

  await owner`DELETE FROM memberships WHERE id = ${roomie.membershipId}`;
  const flipped = await tx(admin, (t) => refreshBillStatus(t, [twoDebtors.billId]));
  r.check("removing the last unpaid debtor + refreshBillStatus → paid", flipped.get(twoDebtors.billId) === "paid");

  r.section("bills: thanks queue");
  const thanksOn = await tx(admin, (t) => createBill(t, admin, { typeId: lg.typeId, amount: 20, billDate: billOn, dueDate: due }));
  await tx(admin, (t) => setPaid(t, admin, thanksOn.billId, lg.member.membershipId, true));
  const q1 = await owner`SELECT 1 FROM payment_thanks WHERE bill_id = ${thanksOn.billId} AND person_id = ${lg.member.membershipId}`;
  r.check("feature_thanks on: paying queues a thank-you", q1.length === 1);
  await tx(admin, (t) => setPaid(t, admin, thanksOn.billId, lg.member.membershipId, false));
  const q2 = await owner`SELECT 1 FROM payment_thanks WHERE bill_id = ${thanksOn.billId}`;
  r.check("un-paying cancels it", q2.length === 0);
  await owner`UPDATE households SET feature_thanks = false WHERE id = ${lg.id}`;
  const adminNoThanks = await ctxFor(lg.admin.userId, lg.id);
  await tx(adminNoThanks, (t) => setPaid(t, adminNoThanks, thanksOn.billId, lg.member.membershipId, true));
  const q3 = await owner`SELECT 1 FROM payment_thanks WHERE bill_id = ${thanksOn.billId}`;
  r.check("feature_thanks off: nothing queued", q3.length === 0);

  r.section("bills: bill types");
  await refused("a type with bills can't be removed", () => tx(admin, (t) => removeBillType(t, admin, lg.typeId)), /on record/);
  const spare = await tx(admin, (t) => saveBillType(t, admin, { name: `Spare ${RUN}`, emoji: "🧺", processingFee: 1.25, ownerId: lg.member.membershipId }));
  r.check("ledger: a new type keeps the chosen owner and fee", spare.ownerId === lg.member.membershipId && spare.processingFee === 1.25, spare);
  await refused("duplicate type names are refused politely", () => tx(admin, (t) => saveBillType(t, admin, { name: `Spare ${RUN}`, emoji: "🧺", processingFee: 0, ownerId: null })), /already/);
  await refused("an owner from another household is refused", () => tx(admin, (t) => saveBillType(t, admin, { name: `Other ${RUN}`, emoji: "🧺", processingFee: 0, ownerId: sp.admin.membershipId })), /this household/);
  r.check("a type without bills can be removed", (await tx(admin, (t) => removeBillType(t, admin, spare.id))) === spare.name);

  r.section("bills: reserved ids (PDF first, then the row)");
  const prep = await tx(admin, (t) => prepareBill(t, admin, { typeId: lg.typeId, amount: 10, billDate: billOn, dueDate: due }));
  const key = billPdfKey(lg.id, "Gas", billOn, prep.billId);
  const withPdf = await tx(admin, (t) => createBill(t, admin, { typeId: lg.typeId, amount: 10, billDate: billOn, dueDate: due }, { billId: prep.billId, pdfPath: key }));
  const [row] = await owner<{ id: number; pdf: string }[]>`SELECT id, pdf_path AS pdf FROM bills WHERE id = ${prep.billId}`;
  r.check("the bill lands on the reserved id with its PDF key", withPdf.billId === prep.billId && row?.pdf === key);

  r.section("bills: each bill keeps its own owner (0004)");
  const ow = await makeHousehold(owner, "ow", "ledger");
  const owAdmin = await ctxFor(ow.admin.userId, ow.id);
  const owOld = await ctxFor(ow.member.userId, ow.id); // owns Water today
  const heir = await addMember(owner, ow, `ow-heir-${RUN}`);
  const owHeir = await ctxFor(heir.userId, ow.id);
  const oldBill = await tx(owOld, (t) => createBill(t, owOld, { typeId: ow.memberTypeId, amount: 90, billDate: billOn, dueDate: due }));
  const oldRow = await tx(owAdmin, (t) => getBill(t, oldBill.billId));
  r.check("posting snapshots the type's owner onto the bill", oldRow?.ownerId === ow.member.membershipId);
  await tx(owAdmin, (t) => saveBillType(t, owAdmin, { id: ow.memberTypeId, name: "Water", emoji: "💧", processingFee: 0, ownerId: heir.membershipId }));
  const reassigned = await tx(owAdmin, (t) => getBill(t, oldBill.billId));
  r.check("reassigning the type leaves the old bill's creditor unchanged", reassigned?.ownerId === ow.member.membershipId && reassigned?.ownerName === `Member ow`, reassigned?.ownerName);
  const owPairs = await tx(owAdmin, (t) => getOwedPairs(t));
  r.check("…in the ledger too: the old bill's debts still run to the old owner",
    owPairs.some((p) => p.ownerId === ow.member.membershipId && p.debtorId === heir.membershipId && p.amount === 30) &&
      !owPairs.some((p) => p.ownerId === heir.membershipId && p.debtorId === heir.membershipId));
  r.check("the old owner can still mark payments on their old bill", (await tx(owOld, (t) => setPaid(t, owOld, oldBill.billId, ow.admin.membershipId, true))) === "unpaid");
  await refused("the type's new owner can't manage the old owner's bill", () => tx(owHeir, (t) => setPaid(t, owHeir, oldBill.billId, ow.admin.membershipId, false)), /types you own/);
  await refused("the old owner can't post new bills of the type", () => tx(owOld, (t) => createBill(t, owOld, { typeId: ow.memberTypeId, amount: 30, billDate: billOn, dueDate: due })), /types you own/);
  const heirBill = await tx(owHeir, (t) => createBill(t, owHeir, { typeId: ow.memberTypeId, amount: 30, billDate: billOn, dueDate: due }));
  r.check("the new owner owns new bills of the type (and isn't a debtor on them)",
    (await tx(owAdmin, (t) => getBill(t, heirBill.billId)))?.ownerId === heir.membershipId && !heirBill.debtors.some((d) => d.id === heir.membershipId));
  await owner`DELETE FROM memberships WHERE id = ${ow.member.membershipId}`;
  const orphan = await tx(owAdmin, (t) => getBill(t, oldBill.billId));
  r.check(`a removed owner shows as "${FORMER_MEMBER}"`, orphan?.ownerId === null && orphan?.ownerName === FORMER_MEMBER, orphan?.ownerName);
  const formerPairs = await tx(owAdmin, (t) => getOwedPairs(t));
  r.check("…in the ledger as well", formerPairs.some((p) => p.ownerId === null && p.owner === FORMER_MEMBER && p.debtorId === heir.membershipId));
  const houseType = await tx(owAdmin, (t) => saveBillType(t, owAdmin, { name: `Shared ${RUN}`, emoji: "🏠", processingFee: 0, ownerId: null }));
  const houseBill = await tx(owAdmin, (t) => createBill(t, owAdmin, { typeId: houseType.id, amount: 20, billDate: billOn, dueDate: due }));
  const houseRow = await tx(owAdmin, (t) => getBill(t, houseBill.billId));
  r.check("a bill posted with no owner stays owed to the house (not a former member)", houseRow?.ownerId === null && houseRow?.ownerName === null);
  await refused("with the owner gone, only an admin can manage the old bill", () => tx(owHeir, (t) => setPaid(t, owHeir, oldBill.billId, heir.membershipId, true)), /types you own/);
  r.check("…and an admin still can", (await tx(owAdmin, (t) => setPaid(t, owAdmin, oldBill.billId, heir.membershipId, true))) === "paid");

  r.section("bills: /files authorization (lib)");
  const other = await makeHousehold(owner, "fo", "ledger");
  const otherKey = billPdfKey(other.id, "Gas", billOn, other.billId);
  await owner`UPDATE bills SET pdf_path = ${otherKey} WHERE id = ${other.billId}`;
  const otherCtx = await ctxFor(other.admin.userId, other.id);
  r.check("own household's recorded key → allowed", (await authorizeFile(admin, key)).ok === true);
  r.check("member of the household may read it too", (await authorizeFile(member, key)).ok === true);
  r.check("another household's key → refused (404)", JSON.stringify(await authorizeFile(admin, otherKey)) === '{"ok":false,"status":404}');
  r.check("…and the other way round", (await authorizeFile(otherCtx, key)).ok === false);
  r.check("own prefix but not recorded → 404", (await authorizeFile(admin, `h/${lg.id}/bills/2030/gas/0101-999999.pdf`)).ok === false);
  r.check("own prefix with ../ → 404", (await authorizeFile(admin, `h/${lg.id}/../${other.id}/bills/x.pdf`)).ok === false);
  r.check("SVG never served", (await authorizeFile(admin, `h/${lg.id}/documents/x.svg`)).ok === false);
  r.check("no session → 403", JSON.stringify(await authorizeFile(null, key)) === '{"ok":false,"status":403}');
  r.check("demo → 404", (await authorizeFile(demoCtx(), key)).ok === false);
}
