import ts from 'typescript';

export interface Declaration {
  id: string;
  name: string;
  file: string;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
  /** Parameters and return type, whitespace-normalised, to tell signature changes from body changes. */
  signature: string;
  node: ts.Node;
}

export const TOP_LEVEL = '(top-level)';

const lineOf = (source: ts.SourceFile, position: number): number =>
  source.getLineAndCharacterOfPosition(position).line + 1;

const normalise = (text: string): string => text.replace(/\s+/g, ' ').trim();

const signatureOf = (source: ts.SourceFile, fn: ts.SignatureDeclaration): string =>
  normalise(
    `(${fn.parameters.map((parameter) => parameter.getText(source)).join(', ')})${fn.type ? `: ${fn.type.getText(source)}` : ''}`,
  );

/** The function an initializer holds, looking through parentheses and type assertions. */
const functionOf = (
  node: ts.Expression | undefined,
): ts.ArrowFunction | ts.FunctionExpression | null => {
  let current = node;
  while (current !== undefined) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      return current;
    }
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current)
    ) {
      current = current.expression;
    } else {
      return null;
    }
  }
  return null;
};

const className = (node: ts.Node): string | null => {
  const parent = node.parent;
  if (
    (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) &&
    parent.name !== undefined
  ) {
    return parent.name.text;
  }
  return null;
};

interface Found {
  name: string;
  node: ts.Node;
  fn: ts.SignatureDeclaration;
}

const found = (node: ts.Node): Found | null => {
  if (ts.isFunctionDeclaration(node)) {
    return { name: node.name?.text ?? 'default', node, fn: node };
  }
  if (
    (ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) &&
    ts.isIdentifier(node.name)
  ) {
    const owner = className(node);
    return owner === null ? null : { name: `${owner}.${node.name.text}`, node, fn: node };
  }
  if (ts.isConstructorDeclaration(node)) {
    const owner = className(node);
    return owner === null ? null : { name: `${owner}.constructor`, node, fn: node };
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    const fn = functionOf(node.initializer);
    return fn === null ? null : { name: node.name.text, node, fn };
  }
  if (ts.isExportAssignment(node) && !node.isExportEquals) {
    const fn = functionOf(node.expression);
    return fn === null ? null : { name: 'default', node, fn };
  }
  return null;
};

/** Functions, methods and function-valued variables of one file, with stable ids. */
export const indexDeclarations = (file: string, source: ts.SourceFile): Declaration[] => {
  const declarations: Declaration[] = [];
  const seen = new Set<string>();
  const visit = (node: ts.Node): void => {
    const match = found(node);
    if (match !== null) {
      const startLine = lineOf(source, match.node.getStart(source));
      const unique = seen.has(match.name) ? `${match.name}:${startLine}` : match.name;
      seen.add(match.name);
      declarations.push({
        id: `${file}#${unique}`,
        name: match.name,
        file,
        startLine,
        endLine: lineOf(source, match.node.getEnd()),
        signature: signatureOf(source, match.fn),
        node: match.node,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return declarations;
};

/** Parses a file on its own (no program), e.g. the merge-base version for classification. */
export const parseFile = (file: string, text: string): ts.SourceFile =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindOf(file));

export const scriptKindOf = (file: string): ts.ScriptKind => {
  if (/\.tsx$/.test(file)) {
    return ts.ScriptKind.TSX;
  }
  if (/\.(jsx)$/.test(file)) {
    return ts.ScriptKind.JSX;
  }
  if (/\.(js|mjs|cjs)$/.test(file)) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
};
