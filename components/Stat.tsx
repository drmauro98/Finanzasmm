export default function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : "text-slate-900";
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`text-xl font-semibold sm:text-2xl ${color}`}>{value}</div>
      {hint && <div className="muted mt-1">{hint}</div>}
    </div>
  );
}
