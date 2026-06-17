import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';

const MDK_SCOPE = '@mdk';
const VENDOR_SCHEMA_VERSION = '1.0';

/* ── mdk search ─────────────────────────────────────────────────── */

interface NpmSearchResult {
  objects: Array<{ package: { name: string; description: string; version: string } }>;
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => (data += chunk as string));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

export async function cmdSearch(query: string): Promise<void> {
  console.log(`Searching npm for ${MDK_SCOPE}/${query}...`);
  try {
    const url = `https://registry.npmjs.org/-/v1/search?text=scope:mdk+${encodeURIComponent(query)}&size=20`;
    const raw = await httpsGet(url);
    const result = JSON.parse(raw) as NpmSearchResult;

    if (!result.objects.length) {
      console.log('No packages found.');
      return;
    }
    console.log(`\nFound ${result.objects.length} package(s):\n`);
    for (const { package: pkg } of result.objects) {
      console.log(`  ${pkg.name}@${pkg.version}`);
      if (pkg.description) console.log(`    ${pkg.description}`);
    }
  } catch {
    console.error('Search failed — check network connection or try: npm search @mdk');
  }
}

/* ── mdk add ────────────────────────────────────────────────────── */

export function cmdAdd(packageName: string): void {
  const name = packageName.startsWith('@mdk/') ? packageName : `@mdk/${packageName}`;
  console.log(`Installing ${name}...`);
  try {
    execSync(`npm install ${name}`, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`✓ ${name} installed`);
  } catch {
    console.error(`Failed to install ${name}`);
    process.exit(1);
  }
}

/* ── mdk remove ─────────────────────────────────────────────────── */

export function cmdRemove(packageName: string): void {
  const name = packageName.startsWith('@mdk/') ? packageName : `@mdk/${packageName}`;
  console.log(`Removing ${name}...`);
  try {
    execSync(`npm uninstall ${name}`, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`✓ ${name} removed`);
  } catch {
    console.error(`Failed to remove ${name}`);
    process.exit(1);
  }
}

/* ── mdk list ───────────────────────────────────────────────────── */

export function cmdList(): void {
  const pkgFile = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgFile)) {
    console.error('No package.json found in current directory.');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  const mdkPkgs = Object.entries(all).filter(([k]) => k.startsWith(`${MDK_SCOPE}/`));

  if (!mdkPkgs.length) {
    console.log('No @mdk/* packages installed in this project.');
    return;
  }
  console.log(`\n@mdk/* packages in this project:\n`);
  for (const [name, ver] of mdkPkgs) console.log(`  ${name}@${ver}`);
}

/* ── mdk package validate ───────────────────────────────────────── */

interface VendorPackage {
  mdk?: {
    schemaVersion?: string;
    vendor?: string;
    model_number?: string;
    description?: string;
    datasheet_url?: string;
  };
  elements?: unknown[];
}

export function cmdPackageValidate(pkgDir?: string): void {
  const dir = path.resolve(process.cwd(), pkgDir ?? '.');
  const indexFile = path.join(dir, 'mdk-package.json');

  if (!fs.existsSync(indexFile)) {
    console.error(`mdk-package.json not found in ${dir}`);
    console.error('Expected: mdk-package.json at the package root');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(indexFile, 'utf8')) as VendorPackage;
  const errors: string[] = [];

  if (!raw.mdk) errors.push('Missing required "mdk" section');
  else {
    const m = raw.mdk;
    if (m.schemaVersion !== VENDOR_SCHEMA_VERSION)
      errors.push(`mdk.schemaVersion must be "${VENDOR_SCHEMA_VERSION}"`);
    if (!m.vendor)        errors.push('Missing mdk.vendor');
    if (!m.model_number)  errors.push('Missing mdk.model_number');
    if (!m.description)   errors.push('Missing mdk.description');
    if (!m.datasheet_url) errors.push('Missing mdk.datasheet_url (required for compliance)');
  }

  if (!Array.isArray(raw.elements) || raw.elements.length === 0)
    errors.push('Missing or empty "elements" array');

  if (errors.length) {
    console.error('✗ Vendor package validation failed:');
    errors.forEach(e => console.error(`  • ${e}`));
    process.exit(1);
  }

  console.log('✓ Vendor package valid');
  console.log(`  Vendor: ${raw.mdk?.vendor} ${raw.mdk?.model_number}`);
  console.log(`  Elements: ${(raw.elements as unknown[]).length}`);
}

/* ── mdk package (publish) ──────────────────────────────────────── */

export function cmdPackagePublish(pkgDir?: string): void {
  const dir = path.resolve(process.cwd(), pkgDir ?? '.');
  cmdPackageValidate(pkgDir);  /* validate first */

  console.log('Publishing to npm...');
  try {
    execSync('npm publish --access public', { stdio: 'inherit', cwd: dir });
    console.log('✓ Published');
  } catch {
    console.error('Publish failed. Ensure you are logged in: npm login');
    process.exit(1);
  }
}
