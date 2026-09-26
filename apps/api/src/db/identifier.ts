const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export function assertSafeIdentifier(value: string, label = 'identifier') {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(`${label} must contain only lowercase letters, digits, and underscores.`);
  }
}

export function quoteIdentifier(value: string) {
  assertSafeIdentifier(value);
  return `"${value}"`;
}

export function qualifiedName(schema: string, name: string) {
  assertSafeIdentifier(schema, 'schema');
  assertSafeIdentifier(name, 'table');
  return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
}

export function regclassName(schema: string, name: string) {
  assertSafeIdentifier(schema, 'schema');
  assertSafeIdentifier(name, 'table');
  return `${schema}.${name}`;
}
