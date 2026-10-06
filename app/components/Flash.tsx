/** Renders the ?ok= / ?err= message a server action redirected back with (lib/flash.ts). */
export default function Flash({ ok, err }: { ok?: string | string[]; err?: string | string[] }) {
  const pick = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const error = pick(err);
  const success = pick(ok);
  if (error) return <div className="flash flash-err" role="alert">{error}</div>;
  if (success) return <div className="flash flash-ok" role="status">{success}</div>;
  return null;
}
