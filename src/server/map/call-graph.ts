import { posix } from 'node:path';

import ts from 'typescript';

import type { Declaration } from './declarations.ts';
import { indexDeclarations, scriptKindOf, TOP_LEVEL } from './declarations.ts';

export const VIRTUAL_ROOT = '/repo';

export interface CallEdge {
  from: string;
  to: string;
}

export interface CallGraph {
  declarations: Map<string, Declaration>;
  edges: CallEdge[];
}

interface PathOptions {
  baseUrl?: string;
  paths?: Record<string, string[]>;
}

/** `baseUrl` and `paths` from a root `tsconfig.json`; `extends` is not followed. */
export const readPathOptions = (tsconfig: string | null): PathOptions => {
  if (tsconfig === null) {
    return {};
  }
  const parsed = ts.parseConfigFileTextToJson('tsconfig.json', tsconfig);
  const options =
    (parsed.config as { compilerOptions?: PathOptions } | undefined)?.compilerOptions ?? {};
  const paths = options.paths;
  return {
    ...(typeof options.baseUrl === 'string' ? { baseUrl: options.baseUrl } : {}),
    ...(paths && typeof paths === 'object' ? { paths } : {}),
  };
};

const toVirtual = (file: string): string => `${VIRTUAL_ROOT}/${file}`;
const fromVirtual = (path: string): string => path.slice(VIRTUAL_ROOT.length + 1);

/**
 * A compiler host that serves only the given files: nothing is ever read from disk, so the
 * analysis sees exactly the commit and nothing else.
 */
export const createMemoryHost = (files: ReadonlyMap<string, string>): ts.CompilerHost => {
  const virtual = new Map([...files].map(([path, text]) => [toVirtual(path), text]));
  const folders = new Set<string>([VIRTUAL_ROOT]);
  for (const path of virtual.keys()) {
    for (let dir = posix.dirname(path); dir.startsWith(VIRTUAL_ROOT); dir = posix.dirname(dir)) {
      folders.add(dir);
      if (dir === VIRTUAL_ROOT) {
        break;
      }
    }
  }
  return {
    getSourceFile: (fileName, languageVersion) => {
      const text = virtual.get(fileName);
      return text === undefined
        ? undefined
        : ts.createSourceFile(fileName, text, languageVersion, true, scriptKindOf(fileName));
    },
    getDefaultLibFileName: () => `${VIRTUAL_ROOT}/__no_lib__.d.ts`,
    writeFile: () => undefined,
    getCurrentDirectory: () => VIRTUAL_ROOT,
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (fileName) => virtual.has(fileName),
    readFile: (fileName) => virtual.get(fileName),
    directoryExists: (dir) => folders.has(dir.replace(/\/$/, '')),
    getDirectories: () => [],
    realpath: (path) => path,
  };
};

const compilerOptions = (pathOptions: PathOptions): ts.CompilerOptions => ({
  noLib: true,
  allowJs: true,
  checkJs: false,
  jsx: ts.JsxEmit.Preserve,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.Latest,
  types: [],
  noEmit: true,
  // Paths in a root tsconfig.json are relative to the repository root.
  baseUrl: posix.join(VIRTUAL_ROOT, pathOptions.baseUrl ?? '.'),
  ...(pathOptions.paths ? { paths: pathOptions.paths } : {}),
});

/** The symbol a call, `new` or JSX element refers to, following import aliases. */
const targetSymbol = (checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined => {
  let location: ts.Node | undefined;
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    location = ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name
      : node.expression;
  } else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    location = node.tagName;
  }
  if (location === undefined) {
    return undefined;
  }
  const symbol = checker.getSymbolAtLocation(location);
  return symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
};

/** The declaration ids a call resolves to; `new X()` resolves to `X.constructor`. */
const calleesOf = (
  checker: ts.TypeChecker,
  node: ts.Node,
  byNode: ReadonlyMap<ts.Node, string>,
  byId: ReadonlyMap<string, Declaration>,
): string[] => {
  const symbol = targetSymbol(checker, node);
  const ids: string[] = [];
  for (const declaration of symbol?.declarations ?? []) {
    const id = byNode.get(declaration);
    if (id !== undefined) {
      ids.push(id);
    } else if (ts.isNewExpression(node) && ts.isClassDeclaration(declaration) && declaration.name) {
      const file = fromVirtual(declaration.getSourceFile().fileName);
      const constructorId = `${file}#${declaration.name.text}.constructor`;
      if (byId.has(constructorId)) {
        ids.push(constructorId);
      }
    }
  }
  return ids;
};

const isCallSite = (node: ts.Node): boolean =>
  ts.isCallExpression(node) ||
  ts.isNewExpression(node) ||
  ts.isJsxOpeningElement(node) ||
  ts.isJsxSelfClosingElement(node);

/**
 * Every function of the snapshot and every call between them that the type checker can resolve
 * statically. Calls made outside any function are attributed to the file's top-level code.
 */
export const buildCallGraph = (
  files: ReadonlyMap<string, string>,
  tsconfig: string | null,
): CallGraph => {
  const options = compilerOptions(readPathOptions(tsconfig));
  const program = ts.createProgram({
    rootNames: [...files.keys()].map(toVirtual),
    options,
    host: createMemoryHost(files),
  });
  const checker = program.getTypeChecker();
  const declarations = new Map<string, Declaration>();
  const byNode = new Map<ts.Node, string>();
  const sources = program
    .getSourceFiles()
    .filter((source) => source.fileName.startsWith(`${VIRTUAL_ROOT}/`));
  for (const source of sources) {
    for (const declaration of indexDeclarations(fromVirtual(source.fileName), source)) {
      declarations.set(declaration.id, declaration);
      byNode.set(declaration.node, declaration.id);
    }
  }
  const edges = new Map<string, CallEdge>();
  for (const source of sources) {
    const file = fromVirtual(source.fileName);
    const visit = (node: ts.Node, caller: string): void => {
      const own = byNode.get(node) ?? caller;
      if (isCallSite(node)) {
        for (const callee of calleesOf(checker, node, byNode, declarations)) {
          if (callee !== own) {
            edges.set(`${own}>${callee}`, { from: own, to: callee });
          }
        }
      }
      ts.forEachChild(node, (child) => visit(child, own));
    };
    visit(source, `${file}#${TOP_LEVEL}`);
  }
  return { declarations, edges: [...edges.values()] };
};
