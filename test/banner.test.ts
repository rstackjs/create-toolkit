import { afterEach, expect, rs, test } from 'rstack/test';
import { logger } from 'rslog';
import { create } from '../src';

const options = {
  name: 'test',
  root: '.',
  templates: [{ name: 'custom', create: rs.fn() }],
  getTemplateName: async () => 'custom',
  argv: ['node', 'test', '.', '--template', 'custom', '--override'],
};

afterEach(() => {
  rs.restoreAllMocks();
});

test.each([
  { banner: undefined, expected: 'Create Test Project' },
  { banner: 'create-rsbuild v2.2.14', expected: 'create-rsbuild v2.2.14' },
])(
  'should display the startup banner: $expected',
  async ({ banner, expected }) => {
    const greet = rs.spyOn(logger, 'greet').mockImplementation(() => {});

    await create({ ...options, banner });

    expect(greet).toHaveBeenCalledExactlyOnceWith(`\n◆  ${expected}`);
  },
);

test('should skip the banner when displaying help', async () => {
  const greet = rs.spyOn(logger, 'greet').mockImplementation(() => {});
  rs.spyOn(logger, 'log').mockImplementation(() => {});

  await create({
    ...options,
    banner: 'create-rsbuild v2.2.14',
    argv: ['node', 'test', '--help'],
  });

  expect(greet).not.toHaveBeenCalled();
});
