import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Vercel runs the paywall (middleware.ts) and the API files as plain Node code.
 * If the compiler is told to output modern `import` syntax they crash on every request
 * ("Cannot use import statement outside a module"). This test compiles them with the
 * project's own settings and checks the output is the kind Vercel can run.
 */
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile('tsconfig.json', ts.sys.readFile).config, ts.sys, '.');

const compile = (file: string) => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { ...cfg.options, noEmit: false }, fileName: file }).outputText;

describe('server code compiles to something Vercel can run', () => {
  it('the project is set to CommonJS output', () => {
    expect(cfg.options.module).toBe(ts.ModuleKind.CommonJS);
  });
  it.each(['middleware.ts', 'api/auth.ts', 'api/me.ts', 'api/refresh.ts', 'api/checkout.ts', 'api/stripe-webhook.ts', 'lib/gate.ts'])('%s has no ES module syntax in its output', (file) => {
    const out = compile(file);
    expect(out).not.toMatch(/^\s*import\s/m);
    expect(out).not.toMatch(/^\s*export\s+(default|const|function|async|\{)/m);
    expect(out).toMatch(/require\(|exports\./);
  });
  it('the paywall still exports a default handler and a matcher', () => {
    const out = compile('middleware.ts');
    expect(out).toMatch(/exports\.default|exports\["default"\]/);
    expect(out).toMatch(/exports\.config/);
  });
});
