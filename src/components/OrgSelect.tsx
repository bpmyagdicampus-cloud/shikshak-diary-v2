import type { Org } from "../lib/orgs";
import { useT } from "../lib/i18n";

export default function OrgSelect({ orgs, value, onChange }: { orgs: Org[]; value: string; onChange: (id: string) => void }) {
  const { tx } = useT();
  if (orgs.length <= 1) return null;
  return (
    <label className="block max-w-sm text-sm">
      <span className="mb-1 block font-medium">{tx("संस्था / क्याम्पस", "Organization / Campus")}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}
