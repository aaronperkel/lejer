/**
 * One status vocabulary everywhere: Paid, or Unpaid. Unpaid is red only once the bill is past
 * due; before that it's a neutral chip, so an owner's open bills don't look alarming and red
 * keeps meaning "late". The due chip carries the countdown.
 */
export default function StatusTag({ paid, overdue }: { paid: boolean; overdue: boolean }) {
  if (paid) return <span className="tag tag-paid">Paid</span>;
  return <span className={`tag ${overdue ? "tag-unpaid" : "tag-open"}`}>Unpaid</span>;
}
