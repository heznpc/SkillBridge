/* global describe, test, expect, jest */

const fs = require('fs');
const path = require('path');
const { createBrowserLaunchEnv } = require('../scripts/lib/browser-launch-env');
const { resolveTakeARepoCli, runTakeARepo } = require('../scripts/run-take-a-repo');
const { scripts } = require('../package.json');

describe('quiet browser launch environment', () => {
  test('overrides leaked headed and inspector settings without mutating the parent environment', () => {
    const parent = {
      E2E_HEADED: '1',
      PWDEBUG: '1',
      PWTEST_INSPECTOR: '1',
      PRESERVED: 'yes',
    };

    expect(createBrowserLaunchEnv(parent)).toEqual({ E2E_HEADED: '0', PWDEBUG: '0', PRESERVED: 'yes' });
    expect(parent).toEqual({
      E2E_HEADED: '1',
      PWDEBUG: '1',
      PWTEST_INSPECTOR: '1',
      PRESERVED: 'yes',
    });
  });

  test('keeps the inspector disabled for an explicit headed launch', () => {
    expect(
      createBrowserLaunchEnv(
        { HEADED: '0', PWDEBUG: '1', PWTEST_INSPECTOR: '1' },
        { headed: true, headedVariable: 'HEADED' },
      ),
    ).toEqual({ HEADED: '1', PWDEBUG: '0' });
  });
});

describe('take-a-repo launcher', () => {
  test('package scripts expose quiet defaults and explicit headed opt-ins', () => {
    expect(scripts['capture:store']).toBe('node scripts/run-take-a-repo.js');
    expect(scripts['capture:store:headed']).toBe('node scripts/run-take-a-repo.js --headed');
    expect(scripts['test:e2e']).toBe('node scripts/run-e2e.js');
    expect(scripts['test:e2e:headed']).toBe('node scripts/run-e2e.js --headed');
    expect(scripts['test:e2e:first-user']).toBe('node scripts/run-e2e.js --first-user');
    expect(scripts['test:e2e:ollama']).toBe('node scripts/run-ollama-e2e.js');
    expect(scripts['test:e2e:ollama:headed']).toBe('node scripts/run-ollama-e2e.js --headed');
  });

  test('resolves the installed CLI', () => {
    const packageEntry = require.resolve('take-a-repo');
    const packageRoot = path.resolve(path.dirname(packageEntry), '..');
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    expect(resolveTakeARepoCli()).toBe(path.resolve(packageRoot, manifest.bin['take-a-repo']));
    expect(fs.existsSync(resolveTakeARepoCli())).toBe(true);
  });

  test('runs quietly by default and forwards take-a-repo arguments', () => {
    const spawn = jest.fn(() => ({ status: 0 }));
    const status = runTakeARepo({
      argv: ['--scene', '01-translate', '--no-video'],
      baseEnv: { HEADED: '1', PWDEBUG: '1', KEEP: 'yes' },
      cwd: '/repo',
      cliPath: '/repo/take-a-repo.js',
      spawn,
    });

    expect(status).toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ['/repo/take-a-repo.js', '--scene', '01-translate', '--no-video'],
      {
        cwd: '/repo',
        env: { HEADED: '1', TAKE_A_REPO_HEADED: '0', PWDEBUG: '0', KEEP: 'yes' },
        stdio: 'inherit',
      },
    );
  });

  test('requires --headed to open the browser UI and does not pass it to take-a-repo', () => {
    const spawn = jest.fn(() => ({ status: 3 }));
    const status = runTakeARepo({
      argv: ['--headed', '--scene', '01-translate'],
      baseEnv: { PWDEBUG: '1' },
      cwd: path.sep,
      cliPath: '/take-a-repo.js',
      spawn,
    });

    expect(status).toBe(3);
    expect(spawn.mock.calls[0][1]).toEqual(['/take-a-repo.js', '--scene', '01-translate']);
    expect(spawn.mock.calls[0][2].env).toEqual({ TAKE_A_REPO_HEADED: '1', PWDEBUG: '0' });
  });

  test('surfaces launcher errors and signals', () => {
    const options = { argv: [], cliPath: '/take-a-repo.js' };
    expect(() => runTakeARepo({ ...options, spawn: () => ({ error: new Error('spawn failed') }) })).toThrow(
      /spawn failed/,
    );
    expect(() => runTakeARepo({ ...options, spawn: () => ({ signal: 'SIGTERM' }) })).toThrow(/SIGTERM/);
    expect(runTakeARepo({ ...options, spawn: () => ({ status: null }) })).toBe(1);
  });
});
