/**
 * SQL building utilities for safe parameterized queries
 */

export interface SqlFragment {
  text: string;
  values: unknown[];
}

/**
 * Build a parameterized SQL fragment
 */
export function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): SqlFragment {
  let text = "";
  const params: unknown[] = [];

  strings.forEach((str, i) => {
    text += str;
    if (i < values.length) {
      params.push(values[i]);
      text += `$${params.length}`;
    }
  });

  return { text, values: params };
}

/**
 * Join multiple SQL fragments with a separator
 */
export function joinSql(
  fragments: SqlFragment[],
  separator: string
): SqlFragment {
  if (fragments.length === 0) {
    return { text: "", values: [] };
  }

  const allValues: unknown[] = [];
  let paramOffset = 0;

  const textParts = fragments.map((fragment) => {
    // Re-number the parameters
    let text = fragment.text;
    fragment.values.forEach((val, idx) => {
      const oldParam = `$${idx + 1}`;
      const newParam = `$${paramOffset + idx + 1}`;
      text = text.replace(oldParam, newParam);
      allValues.push(val);
    });
    paramOffset += fragment.values.length;
    return text;
  });

  return {
    text: textParts.join(separator),
    values: allValues,
  };
}

/**
 * Create a raw SQL fragment (no parameter substitution)
 */
export function raw(text: string): SqlFragment {
  return { text, values: [] };
}
