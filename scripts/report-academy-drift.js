const fs = require('fs');
const { createHash } = require('crypto');

const MARKER = '<!-- skillbridge-academy-drift -->';
const TITLE = '🆕 Anthropic Academy catalog drift — terminology/store listing update needed';

module.exports = async function reportAcademyDrift({ github, context, core }) {
  const { unknown, storeListingIssue } = JSON.parse(fs.readFileSync('academy-courses-drift.json', 'utf8'));
  const repo = context.repo;
  const issues = await github.paginate(github.rest.issues.listForRepo, { ...repo, state: 'open', per_page: 100 });
  const existing = issues.find((issue) => !issue.pull_request && issue.body?.includes(MARKER));

  if (unknown.length === 0 && !storeListingIssue) {
    if (existing) {
      await github.rest.issues.update({
        ...repo,
        issue_number: existing.number,
        state: 'closed',
        state_reason: 'completed',
      });
    }
    core.info('Academy catalog and store listing are in sync.');
    return;
  }

  const fingerprint = createHash('sha256').update(JSON.stringify({ unknown, storeListingIssue })).digest('hex');
  const signature = `<!-- drift:${fingerprint} -->`;
  if (existing?.body?.includes(signature)) {
    core.info(`The same catalog drift is already tracked in #${existing.number}.`);
    return;
  }

  const report = fs.readFileSync('academy-courses-report.txt', 'utf8');
  const body = [
    MARKER,
    signature,
    'The live Academy catalog differs from the packaged course map or store listing.',
    '',
    report,
    '',
    `Workflow run: ${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}`,
    '',
    'This issue updates only when the detected drift changes and closes after the catalog check passes.',
  ].join('\n');
  if (existing) {
    await github.rest.issues.update({ ...repo, issue_number: existing.number, body });
  } else {
    await github.rest.issues.create({
      ...repo,
      title: TITLE,
      body,
      labels: ['academy-drift', 'i18n', 'priority:high'],
    });
  }
};
