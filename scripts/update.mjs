import { loadJournals, loadTopics } from '../src/config.mjs';
import { isMonday, isoWeekKey, previousNaturalWeek, recentRange, todayInShanghai } from '../src/dates.mjs';
import { generateReport } from '../src/pipeline.mjs';

function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, ...rest] = item.slice(2).split('=');
    args[key] = rest.length ? rest.join('=') : true;
  }
  return args;
}

function normalizeKind(value, date) {
  const kind = String(value || 'auto');
  if (kind === 'auto') return isMonday(date) ? ['daily', 'weekly'] : ['daily'];
  if (kind === 'both') return ['daily', 'weekly'];
  if (kind === 'daily' || kind === 'weekly') return [kind];
  throw new Error(`--kind 只能是 auto、daily、weekly 或 both，当前为 ${kind}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = String(args.date || todayInShanghai());
  const kinds = normalizeKind(args.kind, date);
  const journals = await loadJournals();
  const topics = await loadTopics();
  const options = {
    fixturePath: args.fixture ? String(args.fixture) : undefined,
    skipEnrichment: Boolean(args['no-enrichment']),
    disableLlm: Boolean(args['no-llm']),
    write: !args['dry-run'],
    contactEmail: String(process.env.CROSSREF_MAILTO || process.env.CONTACT_EMAIL || '').trim(),
    llmBaseUrl: process.env.LLM_BASE_URL,
    llmApiKey: process.env.LLM_API_KEY,
    llmModel: process.env.LLM_MODEL,
    maxPages: 2,
    maxEnrichment: 32,
    maxLanding: 8
  };

  const generated = [];
  for (const kind of kinds) {
    const period = kind === 'weekly' ? previousNaturalWeek(date) : recentRange(date, 30);
    const reportId = kind === 'weekly' ? isoWeekKey(period.to) : date;
    const report = await generateReport({ kind, date, reportId, period, journals, topics, options });
    generated.push({ kind, reportId, paperCount: report.paperCount, warnings: report.warnings.length });
  }
  console.log(JSON.stringify({ date, generated }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
