/** Review and rollback use the real Reports UI and affect both live tabs. */
const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test('reviewed corrections apply only to the exact source/language and rollback preserves the regression record', async () => {
  const fixture = await startFixtureServer();
  const ext = await launchExtension();
  try {
    await registerStubs(ext.context);
    const urls = [`${fixture.baseUrl}/lesson?correction=A`, `${fixture.baseUrl}/lesson?correction=B`];
    const op = (tab, name, arg) => evalInContentWorld(ext.context, name, arg, urls[tab]);
    const pages = [];
    for (let i = 0; i < 2; i++) {
      const page = await ext.context.newPage();
      pages.push(page);
      await page.goto(urls[i]);
      await expect.poll(async () => (await op(i, 'snapshot'))?.methods?.gt?.processOneElement).toBe('function');
      await op(i, 'switchLanguage', 'ko');
    }
    const baseline = '이 강의는 프롬프트 엔지니어링의 기초와 Claude가 사용자 요청을 처리하는 방법을 다룹니다.';
    const correction = '사용자가 직접 검토한 프롬프트 작성 교정문입니다.';
    for (let i = 0; i < 2; i++) await expect.poll(async () => (await op(i, 'pageText')).p1).toBe(baseline);
    await op(0, 'recordFeedback', {
      pair: {
        originalText: 'This lesson covers prompt engineering fundamentals and how Claude processes user requests.',
        translatedText: baseline,
        selectedText: baseline,
      },
      signal: 'negative',
      correction,
    });
    expect((await op(0, 'pageText')).p1).toBe(baseline);
    await op(0, 'injectSidebar');
    await op(0, 'toggleSidebar');
    await op(0, 'toggleReportsPanel');
    await expect.poll(async () => (await op(0, 'readReportsList')).length).toBe(1);
    expect(await op(0, 'openCorrectionReview', 0)).toEqual({ found: true });
    await pages[0].screenshot({ path: test.info().outputPath('correction-review.png') });
    expect((await op(0, 'correctionAction', 'apply')).found).toBe(true);
    for (let i = 0; i < 2; i++) await expect.poll(async () => (await op(i, 'pageText')).p1).toBe(correction);
    expect((await op(0, 'pageText')).h1).toBe('Claude 소개');
    await op(1, 'switchLanguage', 'en');
    expect((await op(1, 'pageText')).p1).toContain('This lesson covers');
    await op(1, 'switchLanguage', 'ko');
    await expect.poll(async () => (await op(1, 'pageText')).p1).toBe(correction);
    expect(await op(0, 'openCorrectionReview', 0)).toEqual({ found: true });
    expect((await op(0, 'correctionAction', 'revert')).found).toBe(true);
    for (let i = 0; i < 2; i++) await expect.poll(async () => (await op(i, 'pageText')).p1).toBe(baseline);
    const saved = await op(0, 'storageState', ['sb_term_reports']);
    expect(saved.sb_term_reports).toHaveLength(1);
    expect(saved.sb_term_reports[0]).toMatchObject({ correction, correctionStatus: 'reverted' });
    expect(saved.sb_term_reports[0].correctionHistory.map((item) => item.action)).toEqual(['applied', 'reverted']);
    await pages[1].reload();
    await expect.poll(async () => (await op(1, 'pageText')).p1).toBe(baseline);
  } finally {
    await closeExtension(ext);
    await stopFixtureServer(fixture.server);
  }
});
