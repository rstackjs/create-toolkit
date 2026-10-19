import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as promptsActual from '@clack/prompts' with { rstest: 'importActual' };
import { beforeEach, expect, rs, test } from 'rstack/test';
import { logger } from 'rslog';
import { create } from '../src';

const mocks = rs.hoisted(() => ({ text: rs.fn(), multiselect: rs.fn() }));
rs.mock('@clack/prompts', () => ({ ...promptsActual, ...mocks }));

let root: string;
let projectDir: string;

beforeEach(() => {
  rs.resetAllMocks();
  rs.spyOn(logger, 'greet').mockImplementation(() => {});
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-toolkit-cli-version-'));
  projectDir = path.join(root, 'project');
  fs.mkdirSync(path.join(root, 'template-common'));
  fs.mkdirSync(path.join(root, 'template-vanilla'));
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ version: '1.0.0' }),
  );
  fs.writeFileSync(
    path.join(root, 'template-vanilla/package.json'),
    JSON.stringify({
      name: 'template',
      dependencies: { example: 'workspace:*' },
    }),
  );

  return () => {
    rs.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  };
});

const getOptions = () => ({
  name: 'test',
  root,
  templates: ['vanilla'],
  getTemplateName: async () => 'vanilla',
  git: false,
  argv: ['node', 'test', projectDir, '--template', 'vanilla'],
});

test.each([
  { options: {}, suffix: '' },
  { options: { cliVersion: '' }, suffix: '' },
  { options: { cliVersion: '2.3.4' }, suffix: ' v2.3.4' },
  { options: { cliVersion: '2.3.4-beta.1' }, suffix: ' v2.3.4-beta.1' },
])(
  'should display the non-interactive greeting with $options',
  async ({ options, suffix }) => {
    await create({ ...getOptions(), ...options });

    expect(logger.greet).toHaveBeenCalledExactlyOnceWith(
      `\n◆  Create Test Project${suffix}`,
    );
    expect(mocks.text).not.toHaveBeenCalled();
    expect(mocks.multiselect).not.toHaveBeenCalled();
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.dependencies.example).toBe('^1.0.0');
  },
);

test.each([
  { version: '3.0.0', expected: '^3.0.0' },
  { version: { example: '~4.0.0' }, expected: '~4.0.0' },
])(
  'should keep dependency version replacement separate: $version',
  async ({ version, expected }) => {
    await create({ ...getOptions(), version, cliVersion: '2.3.4' });

    expect(logger.greet).toHaveBeenCalledExactlyOnceWith(
      '\n◆  Create Test Project v2.3.4',
    );
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.dependencies.example).toBe(expected);
  },
);

test('should display the CLI version before interactive prompts', async () => {
  mocks.text.mockImplementation(async () => {
    expect(logger.greet).toHaveBeenCalledExactlyOnceWith(
      '\n◆  Create Test Project v2.3.4',
    );
    return projectDir;
  });

  await create({
    ...getOptions(),
    cliVersion: '2.3.4',
    builtinTools: [],
    argv: ['node', 'test'],
  });

  expect(mocks.text).toHaveBeenCalledTimes(1);
  expect(fs.existsSync(path.join(projectDir, 'package.json'))).toBe(true);
});

test('should leave help output unchanged when a CLI version is provided', async () => {
  const log = rs.spyOn(logger, 'log').mockImplementation(() => {});
  const getTemplateName = rs.fn();
  const options = {
    ...getOptions(),
    getTemplateName,
    argv: ['node', 'test', '--help'],
  };

  await create(options);
  const helpCalls = [...log.mock.calls];
  log.mockClear();
  await create({ ...options, cliVersion: '2.3.4' });

  expect(log.mock.calls).toEqual(helpCalls);
  expect(logger.greet).not.toHaveBeenCalled();
  expect(getTemplateName).not.toHaveBeenCalled();
  expect(mocks.text).not.toHaveBeenCalled();
  expect(fs.existsSync(projectDir)).toBe(false);
});
