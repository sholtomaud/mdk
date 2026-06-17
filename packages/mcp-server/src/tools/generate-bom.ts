import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

export const generateBomSchema = {
  model_json: z.string().describe('Model Assembly JSON to extract BOM from'),
};

interface MdkPackageElement {
  name: string;
  bgType: string;
  domain?: string;
  parameters?: Record<string, unknown>;
}

interface MdkPackage {
  mdk: { vendor: string; model_number: string; description: string; datasheet_url?: string };
  elements: MdkPackageElement[];
}

function findVendorPackages(): Map<string, MdkPackage> {
  const catalog = new Map<string, MdkPackage>();
  const candidates = [
    path.resolve(__dirname, '../../../../node_modules/@mdk'),
    path.resolve(process.cwd(), 'node_modules/@mdk'),
  ];
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue;
    for (const pkg of fs.readdirSync(base)) {
      const pkgFile = path.join(base, pkg, 'mdk-package.json');
      if (fs.existsSync(pkgFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as MdkPackage;
          catalog.set(`@mdk/${pkg}`, data);
        } catch { /* skip malformed */ }
      }
    }
  }
  return catalog;
}

interface BomItem {
  name:       string;
  type:       string;
  parameter?: unknown;
  vendor?:    string;
}

export async function generateBom({ model_json }: { model_json: string }): Promise<string> {
  let model: unknown;
  try {
    model = JSON.parse(model_json);
  } catch {
    return JSON.stringify({ error: 'Invalid JSON' });
  }

  const catalog = findVendorPackages();
  const elements: unknown[] = (model as Record<string, unknown[]>).elements ??
    (model as Record<string, unknown[]>).nodes ?? [];

  const items: BomItem[] = [];
  const rows: string[] = ['| Component | Package | Type | Parameters |', '|---|---|---|---|'];

  for (const el of elements) {
    const e = el as Record<string, unknown>;
    const name   = String(e.name ?? e.id ?? '—');
    const bgType = String(e.type ?? '—');
    const param  = e.parameter !== undefined ? e.parameter : e.value;
    const paramStr = param !== undefined ? JSON.stringify({ value: param }) : '—';

    let vendor: string | undefined;
    for (const [pkgName, pkg] of catalog) {
      if (pkg.elements.find(ve => ve.bgType === bgType)) {
        vendor = `${pkgName} (${pkg.mdk.model_number})`;
        break;
      }
    }

    items.push({ name, type: bgType, ...(param !== undefined ? { parameter: param } : {}), ...(vendor ? { vendor } : {}) });
    rows.push(`| ${name} | ${vendor ?? '—'} | ${bgType} | ${paramStr} |`);
  }

  const markdown = `## Bill of Materials\n\n${rows.join('\n')}\n\n` +
    `**Total elements:** ${elements.length}  \n` +
    `**Vendor catalog entries:** ${catalog.size}`;

  return JSON.stringify({ items, markdown, total: items.length }, null, 2);
}
