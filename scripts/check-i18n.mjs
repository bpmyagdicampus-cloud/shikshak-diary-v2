// नेपाली (देवनागरी) पाठ सिधै JSX/कोडमा नलेखिएको जाँच गर्छ।
// सबै देखिने पाठ tx("नेपाली", "English") वा pick() मार्फत हुनुपर्छ।
// फेल भए: npm run build रोकिन्छ।
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "src";
const DEVANAGARI = /[\u0900-\u097F]/;
// भाषा छनोट बटन, र भाषा-डाटा (dictionary) फाइलहरू अनुमति प्राप्त छन्
const ALLOW_FILES = new Set(["src/lib/i18n.tsx", "src/lib/supabase.ts"]); // supabase.ts: developer setup error
const ALLOW_LINE = [/tx\(/, /\bne:\s*"/, /\ben:\s*"/, /^\s*\/\//, /\/\*/, /^\s*\*/, />नेपाली</, /"नेपाली"|>ने</];

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const problems = [];
for (const file of walk(ROOT).filter((f) => /\.(tsx|ts)$/.test(f))) {
  const rel = relative(".", file).split("\\").join("/");
  if (ALLOW_FILES.has(rel)) continue;
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    if (DEVANAGARI.test(line) && !ALLOW_LINE.some((r) => r.test(line))) {
      problems.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
}

if (problems.length) {
  console.error("❌ नेपाली पाठ tx() बाहिर भेटियो (English मोडमा देखिँदैन):\n" + problems.join("\n"));
  process.exit(1);
}
console.log("✅ i18n जाँच पास");
