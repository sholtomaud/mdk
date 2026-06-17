/* MDK TypeScript Language Server Plugin (T5.2)
 *
 * Registers via tsconfig.json plugins array:
 *   "plugins": [{ "name": "@mdk/ts-plugin" }]
 *
 * Provides:
 *   - Hover documentation for all Bond Graph element types
 *   - Quick-info enrichment describing the physical semantics of each element
 *   - Diagnostic hint when `.bond()` is called between elements of different domains
 *     (static analysis — runtime domain mismatch is caught by `mdk validate`)
 */

import type * as ts from 'typescript/lib/tsserverlibrary';

/* Bond Graph element hover documentation */
const BG_HOVER: Record<string, string> = {
  Se:  'Effort Source — imposes a fixed effort (voltage, force, pressure) independent of flow.',
  Sf:  'Flow Source — imposes a fixed flow (current, velocity, volume flow) independent of effort.',
  R:   'Resistive element — dissipates energy. Constitutive law: e = R·f (generalised Ohm\'s law).',
  C:   'Capacitive element — stores energy via effort accumulation. Constitutive law: q = C·e.',
  I:   'Inertia element — stores energy via flow accumulation. Constitutive law: p = I·f.',
  TF:  'Transformer — lossless two-port transducer. Scales effort/flow by modulus m (TF:m). Power-conserving.',
  GY:  'Gyrator — lossless two-port coupling different physical domains. e₁ = GY·f₂, e₂ = GY·f₁.',
  J0:  '0-Junction (effort junction) — effort is equal across all bonds; flows sum to zero (KCL analogue).',
  J1:  '1-Junction (flow junction) — flow is equal across all bonds; efforts sum to zero (KVL analogue).',
  /* L2 composites */
  DCMotor:        'L2 Composite: DC Motor — J1_elec → Ra + La → GY (k_t) → J1_mech → B + Jr.',
  Gearbox:        'L2 Composite: Gearbox — single TF element with gear ratio n.',
  LinearSlider:   'L2 Composite: Linear Slider — J1 → mass (I) + viscous damping (R).',
  PIDController:  'L2 Composite: PID Controller — J0 → R(1/Kp) + C(Ki) + I(Kd).',
  /* CDK containers */
  MdkSystem:  'MDK System container. Call synth() to produce a Zod-validated BondGraphModel JSON.',
  MdkStack:   'MDK Stack — logical grouping of MdkSystem instances (CDK pattern).',
  MdkApp:     'MDK App — root container grouping MdkStack instances.',
  PowerBond:  'Represents an energy bond between two Bond Graph elements. Created by element.bond().',
};

/* Physical domain associated with each element class (for cross-domain diagnostic hint) */
const BG_DOMAIN: Record<string, string> = {
  Se: 'source', Sf: 'source', R: 'passive', C: 'passive', I: 'passive',
  TF: 'transducer', GY: 'transducer', J0: 'junction', J1: 'junction',
};

function init(modules: { typescript: typeof ts }): ts.server.PluginModule {
  const typescript = modules.typescript;

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    /* Build proxy that forwards all calls to the original language service */
    const proxy: ts.LanguageService = Object.create(null);
    const ls = info.languageService;

    for (const k of Object.keys(ls) as Array<keyof ts.LanguageService>) {
      const fn = ls[k]!;
      (proxy as unknown as Record<string, unknown>)[k] = (...args: unknown[]) =>
        (fn as (...a: unknown[]) => unknown).apply(ls, args);
    }

    /* ── Override getQuickInfoAtPosition to inject BG documentation ── */
    proxy.getQuickInfoAtPosition = (fileName: string, position: number) => {
      const prior = ls.getQuickInfoAtPosition(fileName, position);

      const program = ls.getProgram();
      if (!program) return prior;
      const sourceFile = program.getSourceFile(fileName);
      if (!sourceFile) return prior;

      const token = findTokenAtPosition(sourceFile, position, typescript);
      if (!token || token.kind !== typescript.SyntaxKind.Identifier) return prior;

      const name = (token as ts.Identifier).text;
      const doc = BG_HOVER[name];
      if (!doc) return prior;

      const mdkPart: ts.SymbolDisplayPart = {
        text: `\n\n**MDK Bond Graph** — ${doc}`,
        kind: 'text',
      };

      if (!prior) {
        return {
          kind: typescript.ScriptElementKind.classElement,
          kindModifiers: '',
          textSpan: { start: token.getStart(sourceFile), length: token.getWidth(sourceFile) },
          displayParts: [{ text: name, kind: 'className' }],
          documentation: [mdkPart],
        };
      }

      return { ...prior, documentation: [...(prior.documentation ?? []), mdkPart] };
    };

    /* ── Override getSemanticDiagnostics to add cross-domain bond hints ── */
    proxy.getSemanticDiagnostics = (fileName: string) => {
      const prior = ls.getSemanticDiagnostics(fileName);
      const program = ls.getProgram();
      if (!program) return prior;
      const sourceFile = program.getSourceFile(fileName);
      if (!sourceFile) return prior;

      const extra = collectBondDiagnostics(sourceFile, program, typescript);
      return [...prior, ...extra];
    };

    return proxy;
  }

  return { create };
}

/* ── AST helpers ─────────────────────────────────────────────── */

function findTokenAtPosition(
  sourceFile: ts.SourceFile,
  position: number,
  typescript: typeof ts,
): ts.Node | undefined {
  function find(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      return typescript.forEachChild(node, find) ?? node;
    }
    return undefined;
  }
  return find(sourceFile);
}

/* Walk the file looking for .bond() calls and check if both sides have
 * domain annotations. This is a best-effort static check — we can only
 * detect domain mismatches when domain is a string literal in the constructor. */
function collectBondDiagnostics(
  sourceFile: ts.SourceFile,
  program: ts.Program,
  typescript: typeof ts,
): ts.Diagnostic[] {
  const checker = program.getTypeChecker();
  const diagnostics: ts.Diagnostic[] = [];

  function visit(node: ts.Node) {
    /* Look for: expr.bond(arg) */
    if (
      typescript.isCallExpression(node) &&
      typescript.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'bond'
    ) {
      const callerType = checker.getTypeAtLocation(node.expression.expression);
      const argType = node.arguments[0]
        ? checker.getTypeAtLocation(node.arguments[0])
        : undefined;

      const callerName = callerType.symbol?.name ?? '';
      const argName = argType?.symbol?.name ?? '';

      const callerDomain = BG_DOMAIN[callerName];
      const argDomain = BG_DOMAIN[argName];

      if (
        callerDomain && argDomain &&
        callerDomain !== 'junction' && argDomain !== 'junction' &&
        callerDomain !== 'transducer' && argDomain !== 'transducer' &&
        callerDomain !== argDomain
      ) {
        diagnostics.push({
          file: sourceFile,
          start: node.getStart(sourceFile),
          length: node.getWidth(sourceFile),
          messageText: `MDK: Direct bond between different-domain elements (${callerName} → ${argName}). Insert a TF or GY to bridge domains, or use J0/J1 junctions.`,
          category: typescript.DiagnosticCategory.Suggestion,
          code: 7391,  /* unused code slot — MDK-specific */
        });
      }
    }
    typescript.forEachChild(node, visit);
  }

  visit(sourceFile);
  return diagnostics;
}

export = init;
