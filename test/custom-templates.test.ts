import fs from 'node:fs';
import path from 'node:path';
import * as promptsActual from '@clack/prompts' with { rstest: 'importActual' };
import { beforeEach, expect, rs, test } from 'rstack/test';
import { create } from '../src';

const fixturesDir = path.join(import.meta.dirname, 'fixtures/basic');
const projectDir = path.join(fixturesDir, 'test-temp-custom-template');
const mocks = rs.hoisted(() => ({
  text: rs.fn(),
  select: rs.fn(),
  multiselect: rs.fn(),
}));

rs.mock('@clack/prompts', () => ({ ...promptsActual, ...mocks }));

beforeEach(() => {
  rs.clearAllMocks();
  fs.rmSync(projectDir, { recursive: true, force: true });
  return () => fs.rmSync(projectDir, { recursive: true, force: true });
});

test('should run a custom template with the prompted project path and skip local scaffolding', async () => {
  const targetDir = path.relative(process.cwd(), projectDir);
  mocks.text.mockResolvedValue(` ${targetDir}/ `);
  const onGitResolved = rs.fn();
  const createTemplate = rs.fn(async () => {});

  await create({
    name: 'test',
    root: fixturesDir,
    templates: [{ name: 'external', create: createTemplate }],
    getTemplateName: async () => 'external',
    getPackageManager: () => 'pnpm',
    onGitResolved,
    argv: ['node', 'test', '--package-name', '@scope/app', '--no-git'],
  });

  expect(createTemplate).toHaveBeenCalledWith({
    distFolder: projectDir,
    packageName: '@scope/app',
    packageManager: 'pnpm',
    gitEnabled: false,
    override: false,
  });
  expect(mocks.multiselect).not.toHaveBeenCalled();
  expect(onGitResolved).not.toHaveBeenCalled();
  expect(fs.existsSync(projectDir)).toBe(false);
});

test('should pass confirmed overwrite permission to the custom template', async () => {
  fs.mkdirSync(projectDir);
  const existingFile = path.join(projectDir, 'existing.txt');
  fs.writeFileSync(existingFile, 'keep');
  mocks.select.mockResolvedValue('yes');
  const createTemplate = rs.fn();

  await create({
    name: 'test',
    root: fixturesDir,
    templates: [{ name: 'external', create: createTemplate }],
    getTemplateName: async () => 'external',
    argv: ['node', 'test', projectDir, '--template', 'external'],
  });

  expect(createTemplate).toHaveBeenCalledWith(
    expect.objectContaining({ override: true, distFolder: projectDir }),
  );
  expect(fs.readFileSync(existingFile, 'utf8')).toBe('keep');
});

test('should scaffold string templates alongside custom templates', async () => {
  const createTemplate = rs.fn();
  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla', { name: 'external', create: createTemplate }],
    getTemplateName: async () => 'vanilla',
    git: false,
    argv: ['node', 'test', projectDir, '--template', 'vanilla'],
  });

  expect(fs.existsSync(path.join(projectDir, 'package.json'))).toBe(true);
  expect(createTemplate).not.toHaveBeenCalled();
});

test('should resolve the package name when creating in the current directory', async () => {
  const createTemplate = rs.fn();

  await create({
    name: 'test',
    root: fixturesDir,
    templates: [{ name: 'external', create: createTemplate }],
    getTemplateName: async () => 'external',
    argv: ['node', 'test', '.', '--template', 'external', '--override'],
  });

  expect(createTemplate).toHaveBeenCalledWith(
    expect.objectContaining({
      distFolder: process.cwd(),
      packageName: path.basename(process.cwd()),
      override: true,
    }),
  );
});

test('should propagate custom template errors without falling back to local scaffolding', async () => {
  const error = new Error('External scaffolder failed');

  await expect(
    create({
      name: 'test',
      root: fixturesDir,
      templates: [
        {
          name: 'vanilla',
          create: async () => {
            throw error;
          },
        },
      ],
      getTemplateName: async () => 'vanilla',
      argv: ['node', 'test', projectDir, '--template', 'vanilla'],
    }),
  ).rejects.toBe(error);

  expect(fs.existsSync(projectDir)).toBe(false);
});
