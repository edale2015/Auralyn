import type { CaseState } from "../../shared/agentTypes";

type EvalContext = Record<string, any>;

function resolvePath(obj: any, path: string): any {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function buildContext(state: CaseState): EvalContext {
  return {
    answers: state.answers ?? {},
    scores: state.scores ?? {},
    modifiers: state.modifiers ?? {},
    demographics: state.demographics ?? {},
    redFlags: state.redFlags ?? [],
    redFlagGate: state.redFlagGate ?? {},
    routing: state.routing ?? {},
    dm: state.dm ?? {},
    htn: state.htn ?? {},
    glp1: state.glp1 ?? {},
    bariatric: state.bariatric ?? {},
    metabolic: state.metabolic ?? {},
    social: state.social ?? {},
    confidence: state.confidence ?? {},
    activeClusters: state.activeClusters ?? [],
    candidateDiagnoses: state.candidateDiagnoses ?? [],
    fhirPrefill: state.fhirPrefill ?? {},
  };
}

enum TokenType {
  NUMBER,
  STRING,
  BOOLEAN,
  IDENT,
  OP,
  LPAREN,
  RPAREN,
  LBRACKET,
  RBRACKET,
  COMMA,
  EOF,
}

interface Token {
  type: TokenType;
  value: string;
  numValue?: number;
  boolValue?: boolean;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === "(") { tokens.push({ type: TokenType.LPAREN, value: "(" }); i++; continue; }
    if (ch === ")") { tokens.push({ type: TokenType.RPAREN, value: ")" }); i++; continue; }
    if (ch === "[") { tokens.push({ type: TokenType.LBRACKET, value: "[" }); i++; continue; }
    if (ch === "]") { tokens.push({ type: TokenType.RBRACKET, value: "]" }); i++; continue; }
    if (ch === ",") { tokens.push({ type: TokenType.COMMA, value: "," }); i++; continue; }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      let str = "";
      i++;
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === "\\" && i + 1 < expr.length) {
          str += expr[i + 1];
          i += 2;
        } else {
          str += expr[i];
          i++;
        }
      }
      i++;
      tokens.push({ type: TokenType.STRING, value: str });
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "-" && i + 1 < expr.length && /[0-9]/.test(expr[i + 1]))) {
      let num = ch;
      i++;
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push({ type: TokenType.NUMBER, value: num, numValue: parseFloat(num) });
      continue;
    }

    const ops = ["&&", "||", "==", "!=", ">=", "<=", ">", "<", "!", "="];
    let matched = false;
    for (const op of ops) {
      if (expr.substring(i, i + op.length) === op) {
        tokens.push({ type: TokenType.OP, value: op });
        i += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    if (expr.substring(i, i + 2) === "in") {
      const before = i === 0 || /[\s(]/.test(expr[i - 1]);
      const after = i + 2 >= expr.length || /[\s[]/.test(expr[i + 2]);
      if (before && after) {
        tokens.push({ type: TokenType.OP, value: "in" });
        i += 2;
        continue;
      }
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (i < expr.length && /[a-zA-Z0-9_.]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      if (ident === "true") {
        tokens.push({ type: TokenType.BOOLEAN, value: "true", boolValue: true });
      } else if (ident === "false") {
        tokens.push({ type: TokenType.BOOLEAN, value: "false", boolValue: false });
      } else {
        tokens.push({ type: TokenType.IDENT, value: ident });
      }
      continue;
    }

    i++;
  }

  tokens.push({ type: TokenType.EOF, value: "" });
  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos: number;
  private ctx: EvalContext;

  constructor(tokens: Token[], ctx: EvalContext) {
    this.tokens = tokens;
    this.pos = 0;
    this.ctx = ctx;
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: TokenType.EOF, value: "" };
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    this.pos++;
    return t;
  }

  private expect(type: TokenType): Token {
    const t = this.advance();
    if (t.type !== type) throw new Error(`Expected ${TokenType[type]} but got ${TokenType[t.type]} (${t.value})`);
    return t;
  }

  parse(): any {
    const result = this.parseOr();
    return result;
  }

  private parseOr(): any {
    let left = this.parseAnd();
    while (this.peek().type === TokenType.OP && this.peek().value === "||") {
      this.advance();
      const right = this.parseAnd();
      left = left || right;
    }
    return left;
  }

  private parseAnd(): any {
    let left = this.parseNot();
    while (this.peek().type === TokenType.OP && this.peek().value === "&&") {
      this.advance();
      const right = this.parseNot();
      left = left && right;
    }
    return left;
  }

  private parseNot(): any {
    if (this.peek().type === TokenType.OP && this.peek().value === "!") {
      this.advance();
      return !this.parseComparison();
    }
    return this.parseComparison();
  }

  private parseComparison(): any {
    let left = this.parsePrimary();

    const t = this.peek();
    if (t.type === TokenType.OP) {
      const op = t.value;
      if (["==", "!=", ">=", "<=", ">", "<"].includes(op)) {
        this.advance();
        const right = this.parsePrimary();
        switch (op) {
          case "==": return left == right;
          case "!=": return left != right;
          case ">=": return Number(left) >= Number(right);
          case "<=": return Number(left) <= Number(right);
          case ">": return Number(left) > Number(right);
          case "<": return Number(left) < Number(right);
        }
      }
      if (op === "in") {
        this.advance();
        const arr = this.parseArray();
        return Array.isArray(arr) ? arr.includes(left) : false;
      }
    }

    return left;
  }

  private parseArray(): any[] {
    this.expect(TokenType.LBRACKET);
    const items: any[] = [];
    while (this.peek().type !== TokenType.RBRACKET && this.peek().type !== TokenType.EOF) {
      items.push(this.parsePrimary());
      if (this.peek().type === TokenType.COMMA) this.advance();
    }
    this.expect(TokenType.RBRACKET);
    return items;
  }

  private parsePrimary(): any {
    const t = this.peek();

    if (t.type === TokenType.LPAREN) {
      this.advance();
      const result = this.parseOr();
      this.expect(TokenType.RPAREN);
      return result;
    }

    if (t.type === TokenType.NUMBER) {
      this.advance();
      return t.numValue;
    }

    if (t.type === TokenType.STRING) {
      this.advance();
      return t.value;
    }

    if (t.type === TokenType.BOOLEAN) {
      this.advance();
      return t.boolValue;
    }

    if (t.type === TokenType.IDENT) {
      this.advance();

      if (this.peek().type === TokenType.LPAREN) {
        return this.parseCall(t.value);
      }

      return resolvePath(this.ctx, t.value);
    }

    this.advance();
    return undefined;
  }

  private parseCall(name: string): any {
    this.expect(TokenType.LPAREN);
    const args: any[] = [];
    if (this.peek().type !== TokenType.RPAREN) {
      args.push(this.parseOr());
      while (this.peek().type === TokenType.COMMA) {
        this.advance();
        args.push(this.parseOr());
      }
    }
    this.expect(TokenType.RPAREN);

    const fn = name.toUpperCase();
    if (fn === "ALL") {
      if (args.length === 0) throw new Error("ALL() requires at least 1 argument");
      return args.every(Boolean);
    }
    if (fn === "ANY") {
      if (args.length === 0) throw new Error("ANY() requires at least 1 argument");
      return args.some(Boolean);
    }
    if (fn === "NOT") {
      if (args.length !== 1) throw new Error("NOT() expects exactly 1 argument");
      return !args[0];
    }
    if (fn === "LEN") {
      if (args.length !== 1) throw new Error("LEN() expects exactly 1 argument");
      if (Array.isArray(args[0])) return args[0].length;
      return String(args[0] ?? "").length;
    }
    throw new Error(`Unknown function: ${name}`);
  }
}

export function evaluateExpr(expr: string, state: CaseState): any {
  if (!expr || expr.trim() === "" || expr.trim() === "true") return true;
  if (expr.trim() === "false") return false;

  const ctx = buildContext(state);
  const tokens = tokenize(expr);
  normalizeSingleEquals(tokens);
  const parser = new Parser(tokens, ctx);
  try {
    return parser.parse();
  } catch (err: any) {
    console.warn(`[ExprEval] Failed to evaluate "${expr}": ${err.message}`);
    return false;
  }
}

function normalizeSingleEquals(tokens: Token[]): void {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === TokenType.OP && t.value === "=") {
      t.value = "==";
    }
  }
}

export function evaluateExprSafe(expr: string, state: CaseState): { result: boolean; error?: string } {
  try {
    const result = !!evaluateExpr(expr, state);
    return { result };
  } catch (err: any) {
    return { result: false, error: err.message };
  }
}
