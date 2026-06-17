import * as fs from 'fs';
import * as path from 'path';

const MDK_CONFIG = (name: string) => JSON.stringify({
  schemaVersion: '1.0',
  name,
  version: '0.1.0',
  domain: 'bondgraph',
}, null, 2);

const PACKAGE_JSON = (name: string) => JSON.stringify({
  name,
  version: '0.1.0',
  scripts: { synth: 'mdk synth', validate: 'mdk validate' },
  dependencies: { '@mdk/core': '*' },
  devDependencies: { typescript: '^5.3.3' },
}, null, 2);

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2020',
    module: 'CommonJS',
    strict: true,
    esModuleInterop: true,
    outDir: 'dist',
    rootDir: 'src',
  },
  include: ['src/**/*'],
}, null, 2);

const MODEL_TS = (name: string) => `import { Se, R, C, J1, MdkSystem } from '@mdk/core';

/* Example: RC circuit — replace with your system */
const sys = new MdkSystem('${name}');

const vsrc = new Se('Vsrc', { parameter: 12.0, domain: 'electrical' });
const j1   = new J1('J1');
const r    = new R ('R1', { parameter: 100.0, domain: 'electrical' });
const cap  = new C ('C1', { parameter: 0.001, domain: 'electrical' });

vsrc.bond(j1);
j1.bond(r);
j1.bond(cap);

sys.add(vsrc, j1, r, cap);

export const model = sys.synth({
  t_start: 0, t_end: 0.5, dt: 0.001, method: 'rk4',
});
`;

export function cmdNew(projectName: string): void {
  const dir = path.resolve(process.cwd(), projectName);

  if (fs.existsSync(dir)) {
    console.error(`Error: directory '${projectName}' already exists`);
    process.exit(1);
  }

  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'mdk.config.json'), MDK_CONFIG(projectName));
  fs.writeFileSync(path.join(dir, 'package.json'),    PACKAGE_JSON(projectName));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'),   TSCONFIG);
  fs.writeFileSync(path.join(dir, 'src', 'model.ts'), MODEL_TS(projectName));

  console.log(`Created MDK project: ${projectName}/`);
  console.log('  mdk.config.json');
  console.log('  package.json');
  console.log('  tsconfig.json');
  console.log('  src/model.ts');
  console.log(`\nNext:\n  cd ${projectName} && npm install && mdk synth`);
}
