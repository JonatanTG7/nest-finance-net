/** Safe arithmetic evaluator for amount fields ("120 + 45 - 18", "30*3"). No eval(). */

export function hasOperator(s: string): boolean {
  return /[+\-*/×÷x]/i.test(s.trim().replace(/^-/, ""));
}

export function evalExpression(input: string): number | null {
  const src = input
    .replace(/[×xX*]/g, "*")
    .replace(/[÷/]/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/,/g, ".")
    .replace(/\s+/g, "");
  if (!src || !/^[0-9+\-*/().]+$/.test(src)) return null;

  let i = 0;
  const peek = () => src[i];

  function number(): number {
    const start = i;
    while (i < src.length && /[0-9.]/.test(src[i])) i++;
    if (start === i) throw new Error("num");
    const n = Number(src.slice(start, i));
    if (!Number.isFinite(n)) throw new Error("num");
    return n;
  }
  function factor(): number {
    if (peek() === "-") {
      i++;
      return -factor();
    }
    if (peek() === "+") {
      i++;
      return factor();
    }
    if (peek() === "(") {
      i++;
      const v = expr();
      if (peek() !== ")") throw new Error("paren");
      i++;
      return v;
    }
    return number();
  }
  function term(): number {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++];
      const r = factor();
      if (op === "/" && r === 0) throw new Error("div0");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  try {
    const v = expr();
    if (i !== src.length) return null;
    return Math.round(v * 100) / 100;
  } catch {
    return null;
  }
}
