import fs from 'node:fs';
import path from 'node:path';
import * as promptsActual from '@clack/prompts' with { rstest: 'importActual' };
import { beforeEach, expect, rs, test } from 'rstack/test';
import { create } from '../src';

const fixturesDir = path.join(import.meta.dirname, 'fixtures/basic');
const projectDir = path.join(fixturesDir, 'test-temp-custom-template');
const mocks = rs.hoisted(() => ({ text: rs.fn(), select: rs.fn() }));
rs.mock('@clack/prompts', () => ({ ...promptsActual, ...mocks }));

const createTemplate = rs.fn();
const options = {
  name: 'test',
  root: fixturesDir,
  templates: ['vanilla', { name: 'external', create: createTemplate }],
  getTemplateName: async () => 'external',
  argv: ['node', 'test', projectDir, '--template', 'external'],
};

beforeEach(() => {
  rs.resetAllMocks();
  fs.rmSync(projectDir, { recursive: true, force: true });
  return () => fs.rmSync(projectDir, { recursive: true, force: true });
});

test('should pass resolved project options to a custom template', async () => {
  mocks.text.mockResolvedValue(path.relative(process.cwd(), projectDir));

  await create({
    ...options,
    root: projectDir,
    getPackageManager: () => 'pnpm',
    argv: ['node', 'test', '--package-name', '@scope/app', '--no-git'],
  });

  expect(createTemplate).toHaveBeenCalledWith({
    distFolder: projectDir,
    packageName: '@scope/app',
    packageManager: 'pnpm',
    gitEnabled: false,
    override: false,
  });
  expect(fs.existsSync(projectDir)).toBe(false);
});

test('should pass confirmed overwrite permission to a custom template', async () => {
  fs.mkdirSync(projectDir);
  fs.writeFileSync(path.join(projectDir, 'existing.txt'), 'keep');
  mocks.select.mockResolvedValue('yes');

  await create(options);

  expect(createTemplate).toHaveBeenCalledWith(
    expect.objectContaining({ override: true }),
  );
});

test('should support string templates alongside custom templates', async () => {
  await create({
    ...options,
    getTemplateName: async () => 'vanilla',
    git: false,
  });

  expect(fs.existsSync(path.join(projectDir, 'package.json'))).toBe(true);
  expect(createTemplate).not.toHaveBeenCalled();
});

test('should resolve the package name for the current directory', async () => {
  await create({ ...options, argv: ['node', 'test', '.', '--override'] });

  expect(createTemplate).toHaveBeenCalledWith(
    expect.objectContaining({ packageName: path.basename(process.cwd()) }),
  );
});

test('should propagate errors from a custom template', async () => {
  const error = new Error('External scaffolder failed');
  createTemplate.mockRejectedValue(error);

  await expect(create(options)).rejects.toBe(error);
});

test.each([
  {
    args: ['--tools', '', '--skill', 'example-skill', '--template-version', ''],
    unsupported: '--tools, --skill, --template-version',
  },
  { args: ['--templateVersion', '1.0.0'], unsupported: '--template-version' },
])(
  'should reject unsupported options: $args',
  async ({ args, unsupported }) => {
    await expect(
      create({ ...options, argv: [...options.argv, ...args] }),
    ).rejects.toThrow(`Template "external" does not support ${unsupported}.`);
    expect(createTemplate).not.toHaveBeenCalled();
  },
);
