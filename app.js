// Regex Parser, Match Tracer, and SVG Visualizer for Regex Lens

// ==========================================
// 1. REGEX AST PARSER
// ==========================================

class RegexParser {
  constructor(pattern) {
    this.pattern = pattern;
    this.index = 0;
    this.groupCount = 0;
    this.idCounter = 0;
  }

  peek() {
    return this.pattern[this.index];
  }

  next() {
    return this.pattern[this.index++];
  }

  isEOF() {
    return this.index >= this.pattern.length;
  }

  nextId() {
    return 'node_' + (++this.idCounter);
  }

  parse() {
    if (!this.pattern) {
      throw new Error("Empty regular expression");
    }
    const node = this.parseAlternation();
    if (!this.isEOF()) {
      throw new Error(`Unexpected character '${this.peek()}' at position ${this.index}`);
    }
    return node;
  }

  parseAlternation() {
    const options = [this.parseSequence()];
    while (this.peek() === '|') {
      this.next(); // consume '|'
      options.push(this.parseSequence());
    }
    if (options.length === 1) return options[0];
    return { type: 'alternation', options, id: this.nextId() };
  }

  parseSequence() {
    const items = [];
    while (!this.isEOF() && this.peek() !== '|' && this.peek() !== ')') {
      const item = this.parseQuantifier();
      if (item) items.push(item);
    }
    if (items.length === 0) {
      // Empty sequence (e.g. empty alternation branch)
      return { type: 'sequence', items: [], id: this.nextId() };
    }
    if (items.length === 1) return items[0];
    return { type: 'sequence', items, id: this.nextId() };
  }

  parseQuantifier() {
    let node = this.parseAtom();
    if (!node) return null;

    if (this.isEOF()) return node;

    const char = this.peek();
    let quantifier = null;

    if (char === '*') {
      this.next();
      quantifier = { min: 0, max: Infinity };
    } else if (char === '+') {
      this.next();
      quantifier = { min: 1, max: Infinity };
    } else if (char === '?') {
      this.next();
      quantifier = { min: 0, max: 1 };
    } else if (char === '{') {
      // Parse curly quantifiers like {n}, {n,}, {n,m}
      const startIdx = this.index;
      this.next(); // consume '{'
      let minStr = '';
      while (!this.isEOF() && this.peek() >= '0' && this.peek() <= '9') {
        minStr += this.next();
      }
      
      if (!minStr) {
        // Not a valid quantifier syntax, treat as literal '{'
        this.index = startIdx;
        return node;
      }
      
      let min = parseInt(minStr, 10);
      let max = min;

      if (this.peek() === ',') {
        this.next(); // consume ','
        let maxStr = '';
        while (!this.isEOF() && this.peek() >= '0' && this.peek() <= '9') {
          maxStr += this.next();
        }
        max = maxStr ? parseInt(maxStr, 10) : Infinity;
      }

      if (this.peek() !== '}') {
        // Not closed properly, revert
        this.index = startIdx;
        return node;
      }
      this.next(); // consume '}'
      quantifier = { min, max };
    }

    if (quantifier) {
      let greedy = true;
      if (this.peek() === '?') {
        this.next();
        greedy = false;
      }
      return {
        type: 'quantifier',
        min: quantifier.min,
        max: quantifier.max,
        greedy,
        body: node,
        id: this.nextId()
      };
    }

    return node;
  }

  parseAtom() {
    if (this.isEOF()) return null;
    const char = this.peek();

    if (char === '^') {
      this.next();
      return { type: 'anchor', value: '^', id: this.nextId() };
    }
    if (char === '$') {
      this.next();
      return { type: 'anchor', value: '$', id: this.nextId() };
    }
    if (char === '.') {
      this.next();
      return { type: 'wildcard', id: this.nextId() };
    }

    if (char === '\\') {
      this.next(); // consume '\\'
      if (this.isEOF()) throw new Error("Trailing backslash at end of expression");
      const esc = this.next();
      return { type: 'escape', value: esc, id: this.nextId() };
    }

    if (char === '[') {
      return this.parseCharacterClass();
    }

    if (char === '(') {
      this.next(); // consume '('
      let capturing = true;
      if (this.peek() === '?') {
        this.next(); // consume '?'
        if (this.peek() === ':') {
          this.next(); // consume ':'
          capturing = false;
        } else {
          throw new Error(`Unsupported group modifier '?${this.peek()}' at position ${this.index}`);
        }
      }

      let index = 0;
      if (capturing) {
        this.groupCount++;
        index = this.groupCount;
      }

      const body = this.parseAlternation();

      if (this.peek() !== ')') {
        throw new Error("Unclosed group: missing closing parenthesis ')'");
      }
      this.next(); // consume ')'

      return {
        type: 'group',
        capturing,
        index,
        body,
        id: this.nextId()
      };
    }

    // Syntax validation for isolated symbols
    if (char === ')' || char === ']' || char === '}' || char === '|' || char === '*' || char === '+' || char === '?') {
      return null;
    }

    return { type: 'literal', value: this.next(), id: this.nextId() };
  }

  parseCharacterClass() {
    this.next(); // consume '['
    let negated = false;
    if (this.peek() === '^') {
      negated = true;
      this.next(); // consume '^'
    }

    const ranges = [];
    const chars = new Set();

    while (!this.isEOF() && this.peek() !== ']') {
      let startChar = this.next();
      if (startChar === '\\') {
        if (this.isEOF()) throw new Error("Trailing backslash inside character class");
        startChar = this.next();
      }

      if (this.peek() === '-' && this.pattern[this.index + 1] !== ']') {
        this.next(); // consume '-'
        let endChar = this.next();
        if (endChar === '\\') {
          if (this.isEOF()) throw new Error("Trailing backslash inside character class");
          endChar = this.next();
        }
        ranges.push({ start: startChar, end: endChar });
      } else {
        chars.add(startChar);
      }
    }

    if (this.peek() !== ']') {
      throw new Error("Unclosed character class: missing closing bracket ']'");
    }
    this.next(); // consume ']'

    return {
      type: 'character_class',
      negated,
      ranges,
      chars: Array.from(chars),
      id: this.nextId()
    };
  }
}

// ==========================================
// 2. DIAGRAM LAYOUT GENERATOR
// ==========================================

function layoutNode(node) {
  const SPACING_H = 30; // Horizontal spacing between sequence nodes
  const SPACING_V = 24; // Vertical spacing between alternation options
  const PADDING_Q = 20; // Horizontal padding for quantifiers
  const PADDING_G = 18; // Padding for groups

  if (node.type === 'literal' || node.type === 'escape' || node.type === 'wildcard' || node.type === 'character_class' || node.type === 'anchor') {
    let label = '';
    if (node.type === 'literal') label = `'${node.value}'`;
    else if (node.type === 'escape') label = `\\${node.value}`;
    else if (node.type === 'wildcard') label = 'any';
    else if (node.type === 'anchor') label = node.value === '^' ? 'start' : 'end';
    else if (node.type === 'character_class') {
      const parts = [];
      if (node.chars.length > 0) parts.push(node.chars.join(''));
      if (node.ranges.length > 0) parts.push(node.ranges.map(r => `${r.start}-${r.end}`).join(''));
      label = `[${node.negated ? '^' : ''}${parts.join(', ')}]`;
    }

    const textWidth = Math.max(label.length * 8 + 20, 56);
    node.layout = {
      width: textWidth,
      height: 34,
      entryY: 17,
      exitY: 17,
      label: label
    };
    return node.layout;
  }

  if (node.type === 'sequence') {
    if (node.items.length === 0) {
      node.layout = { width: 30, height: 20, entryY: 10, exitY: 10 };
      return node.layout;
    }

    const childrenLayouts = [];
    let maxEntryY = 0;

    for (const item of node.items) {
      const childLayout = layoutNode(item);
      childrenLayouts.push(childLayout);
      maxEntryY = Math.max(maxEntryY, childLayout.entryY);
    }

    let maxPostEntryHeight = 0;
    for (const child of childrenLayouts) {
      maxPostEntryHeight = Math.max(maxPostEntryHeight, child.height - child.entryY);
    }
    const sequenceHeight = maxEntryY + maxPostEntryHeight;

    let currentX = 0;
    for (let i = 0; i < node.items.length; i++) {
      const item = node.items[i];
      const childLayout = item.layout;
      
      item.x = currentX;
      item.y = maxEntryY - childLayout.entryY;

      currentX += childLayout.width;
      if (i < node.items.length - 1) {
        currentX += SPACING_H;
      }
    }

    node.layout = {
      width: currentX,
      height: sequenceHeight,
      entryY: maxEntryY,
      exitY: maxEntryY,
    };
    return node.layout;
  }

  if (node.type === 'alternation') {
    const childrenLayouts = [];
    let maxWidth = 0;
    for (const opt of node.options) {
      childrenLayouts.push(layoutNode(opt));
      maxWidth = Math.max(maxWidth, opt.layout.width);
    }

    let totalHeight = 0;
    for (let i = 0; i < node.options.length; i++) {
      const opt = node.options[i];
      const childLayout = opt.layout;

      opt.x = 35; // Left padding for S-curve
      opt.y = totalHeight;

      totalHeight += childLayout.height;
      if (i < node.options.length - 1) {
        totalHeight += SPACING_V;
      }
    }

    const entryY = totalHeight / 2;

    node.layout = {
      width: maxWidth + 70, // 35px left + 35px right
      height: totalHeight,
      entryY: entryY,
      exitY: entryY
    };

    // Center each child option horizontally within the column space
    for (const opt of node.options) {
      opt.x += (maxWidth - opt.layout.width) / 2;
    }

    return node.layout;
  }

  if (node.type === 'quantifier') {
    const bodyLayout = layoutNode(node.body);
    
    const hasBypass = node.min === 0;
    const hasLoopback = node.max > 1;

    const topSpace = hasBypass ? 18 : 6;
    const bottomSpace = hasLoopback ? 18 : 6;

    node.body.x = PADDING_Q;
    node.body.y = topSpace;

    node.layout = {
      width: bodyLayout.width + PADDING_Q * 2,
      height: bodyLayout.height + topSpace + bottomSpace,
      entryY: bodyLayout.entryY + topSpace,
      exitY: bodyLayout.exitY + topSpace
    };
    return node.layout;
  }

  if (node.type === 'group') {
    const bodyLayout = layoutNode(node.body);
    
    const topSpace = 24;
    const bottomSpace = PADDING_G;
    const sideSpace = PADDING_G;

    node.body.x = sideSpace;
    node.body.y = topSpace;

    node.layout = {
      width: bodyLayout.width + sideSpace * 2,
      height: bodyLayout.height + topSpace + bottomSpace,
      entryY: bodyLayout.entryY + topSpace,
      exitY: bodyLayout.exitY + topSpace
    };
    return node.layout;
  }

  throw new Error(`Unknown node type: ${node.type}`);
}

// ==========================================
// 3. STEP-BY-STEP STATE MACHINE MATCHER
// ==========================================

function match(ast, input, caseInsensitive = false) {
  const steps = [];
  let stepCount = 0;
  let success = false;
  let finalIndex = 0;
  let finalGroups = {};

  function cloneGroups(g) {
    const res = {};
    for (const k in g) {
      res[k] = { ...g[k] };
    }
    return res;
  }

  function getQuantifierSymbol(q) {
    if (q.min === 0 && q.max === Infinity) return '*';
    if (q.min === 1 && q.max === Infinity) return '+';
    if (q.min === 0 && q.max === 1) return '?';
    if (q.min === q.max) return `{${q.min}}`;
    return `{${q.min},${q.max === Infinity ? '' : q.max}}`;
  }

  function getTryMessage(node, index) {
    const char = index < input.length ? `'${input[index]}'` : 'end of string';
    switch (node.type) {
      case 'literal':
        return `Checking literal '${node.value}' against ${char} at position ${index}`;
      case 'escape':
        return `Checking escape sequence \\${node.value} against ${char} at position ${index}`;
      case 'wildcard':
        return `Checking wildcard '.' against ${char} at position ${index}`;
      case 'character_class': {
        const parts = [];
        if (node.chars.length > 0) parts.push(node.chars.join(''));
        if (node.ranges.length > 0) parts.push(node.ranges.map(r => `${r.start}-${r.end}`).join(''));
        const classStr = `[${node.negated ? '^' : ''}${parts.join(', ')}]`;
        return `Checking character class ${classStr} against ${char} at position ${index}`;
      }
      case 'anchor':
        return `Checking anchor ${node.value} at position ${index}`;
      case 'sequence':
        return `Entering sequence pattern`;
      case 'group':
        return `Entering ${node.capturing ? `capture group #${node.index}` : 'non-capturing group'}`;
      case 'alternation':
        return `Entering alternation (choice of options)`;
      default:
        return `Checking node ${node.type}`;
    }
  }

  function matchEscape(escVal, char) {
    switch (escVal) {
      case 'd': return /\d/.test(char);
      case 'D': return /\D/.test(char);
      case 'w': return /\w/.test(char);
      case 'W': return /\W/.test(char);
      case 's': return /\s/.test(char);
      case 'S': return /\S/.test(char);
      case 't': return char === '\t';
      case 'n': return char === '\n';
      case 'r': return char === '\r';
      case '\\': return char === '\\';
      case '.': return char === '.';
      default: return char === escVal;
    }
  }

  function matchCharacterClass(node, char) {
    let targetChar = char;
    if (caseInsensitive) {
      targetChar = char.toLowerCase();
    }

    let matched = false;
    for (const c of node.chars) {
      let compC = c;
      if (caseInsensitive) compC = c.toLowerCase();
      if (targetChar === compC) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      for (const r of node.ranges) {
        let start = r.start;
        let end = r.end;
        if (caseInsensitive) {
          start = start.toLowerCase();
          end = end.toLowerCase();
        }
        if (targetChar >= start && targetChar <= end) {
          matched = true;
          break;
        }
      }
    }

    return node.negated ? !matched : matched;
  }

  function evaluate(node, inputIndex, successors, currentGroups, matchedNodeIds, scanStartIdx) {
    stepCount++;
    if (stepCount > 1500) {
      throw new Error("Match debugger limit reached (to prevent infinite loops on recursive patterns)");
    }

    if (!node) {
      if (successors.length === 0) {
        steps.push({
          id: stepCount,
          nodeId: 'accept',
          inputIndex,
          scanStartIdx,
          status: 'success',
          message: `Match completed successfully! Full match text: "${input.slice(scanStartIdx, inputIndex)}"`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds]
        });
        return { success: true, index: inputIndex, groups: currentGroups };
      }

      const nextNode = successors[0];
      const remaining = successors.slice(1);
      return evaluate(nextNode, inputIndex, remaining, currentGroups, matchedNodeIds, scanStartIdx);
    }

    // Standard evaluations
    steps.push({
      id: stepCount,
      nodeId: node.id,
      inputIndex,
      scanStartIdx,
      status: 'try',
      message: getTryMessage(node, inputIndex),
      groups: cloneGroups(currentGroups),
      matchedNodeIds: [...matchedNodeIds]
    });

    if (node.type === 'literal') {
      const matchChar = input[inputIndex];
      let literalMatches = false;
      if (inputIndex < input.length) {
        if (caseInsensitive) {
          literalMatches = matchChar.toLowerCase() === node.value.toLowerCase();
        } else {
          literalMatches = matchChar === node.value;
        }
      }

      if (inputIndex < input.length && literalMatches) {
        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex: inputIndex + 1,
          scanStartIdx,
          status: 'match',
          message: `Literal matched: '${node.value}' at position ${inputIndex}`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds, node.id]
        });

        const res = evaluate(null, inputIndex + 1, successors, currentGroups, [...matchedNodeIds, node.id], scanStartIdx);
        if (res.success) return res;

        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex,
          scanStartIdx,
          status: 'backtrack',
          message: `Backtracking: discarding literal match '${node.value}' at position ${inputIndex}`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds]
        });
        return { success: false };
      } else {
        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex,
          scanStartIdx,
          status: 'fail',
          message: inputIndex < input.length
            ? `Literal match failed: expected '${node.value}', found '${matchChar}'`
            : `Literal match failed: reached end of string`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds]
        });
        return { success: false };
      }
    }

    if (node.type === 'escape') {
      const matchChar = input[inputIndex];
      const isMatch = inputIndex < input.length && matchEscape(node.value, matchChar);
      
      if (isMatch) {
        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex: inputIndex + 1,
          scanStartIdx,
          status: 'match',
          message: `Escape matched: \\${node.value} at position ${inputIndex}`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds, node.id]
        });

        const res = evaluate(null, inputIndex + 1, successors, currentGroups, [...matchedNodeIds, node.id], scanStartIdx);
        if (res.success) return res;

        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex,
          scanStartIdx,
          status: 'backtrack',
          message: `Backtracking: discarding escape match \\${node.value} at position ${inputIndex}`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds]
        });
        return { success: false };
      } else {
        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex,
          scanStartIdx,
          status: 'fail',
          message: inputIndex < input.length
            ? `Escape sequence match failed: \\${node.value} did not match '${matchChar}'`
            : `Escape sequence match failed: reached end of string`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds]
        });
        return { success: false };
      }
    }

    if (node.type === 'wildcard') {
      if (inputIndex < input.length) {
        const matchChar = input[inputIndex];
        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex: inputIndex + 1,
          scanStartIdx,
          status: 'match',
          message: `Wildcard matched against '${matchChar}' at position ${inputIndex}`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds, node.id]
        });

        const res = evaluate(null, inputIndex + 1, successors, currentGroups, [...matchedNodeIds, node.id], scanStartIdx);
        if (res.success) return res;

        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex,
          scanStartIdx,
          status: 'backtrack',
          message: `Backtracking: discarding wildcard match at position ${inputIndex}`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds]
        });
        return { success: false };
      } else {
        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex,
          scanStartIdx,
          status: 'fail',
          message: `Wildcard match failed: reached end of string`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds]
        });
        return { success: false };
      }
    }

    if (node.type === 'character_class') {
      const matchChar = input[inputIndex];
      const isMatch = inputIndex < input.length && matchCharacterClass(node, matchChar);

      if (isMatch) {
        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex: inputIndex + 1,
          scanStartIdx,
          status: 'match',
          message: `Character class matched: '${matchChar}' at position ${inputIndex}`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds, node.id]
        });

        const res = evaluate(null, inputIndex + 1, successors, currentGroups, [...matchedNodeIds, node.id], scanStartIdx);
        if (res.success) return res;

        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex,
          scanStartIdx,
          status: 'backtrack',
          message: `Backtracking: discarding character class match at position ${inputIndex}`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds]
        });
        return { success: false };
      } else {
        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex,
          scanStartIdx,
          status: 'fail',
          message: inputIndex < input.length
            ? `Character class match failed for '${matchChar}' at position ${inputIndex}`
            : `Character class match failed: reached end of string`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds]
        });
        return { success: false };
      }
    }

    if (node.type === 'anchor') {
      let isMatch = false;
      if (node.value === '^') {
        isMatch = (inputIndex === 0);
      } else if (node.value === '$') {
        isMatch = (inputIndex === input.length);
      }

      if (isMatch) {
        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex,
          scanStartIdx,
          status: 'match',
          message: `Anchor ${node.value} validated successfully`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds, node.id]
        });

        const res = evaluate(null, inputIndex, successors, currentGroups, [...matchedNodeIds, node.id], scanStartIdx);
        if (res.success) return res;

        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex,
          scanStartIdx,
          status: 'backtrack',
          message: `Backtracking: discarding anchor ${node.value} validation`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds]
        });
        return { success: false };
      } else {
        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex,
          scanStartIdx,
          status: 'fail',
          message: node.value === '^'
            ? `Anchor ^ failed: current position ${inputIndex} is not start of string (0)`
            : `Anchor $ failed: current position ${inputIndex} is not end of string (${input.length})`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds]
        });
        return { success: false };
      }
    }

    if (node.type === 'sequence') {
      if (node.items.length === 0) {
        return evaluate(null, inputIndex, successors, currentGroups, matchedNodeIds, scanStartIdx);
      }
      const first = node.items[0];
      const remaining = [...node.items.slice(1), ...successors];
      return evaluate(first, inputIndex, remaining, currentGroups, matchedNodeIds, scanStartIdx);
    }

    if (node.type === 'group') {
      const groupIdx = node.index;
      const nextGroups = cloneGroups(currentGroups);
      if (node.capturing) {
        nextGroups[groupIdx] = { start: inputIndex, end: null, match: '' };
      }

      const endGroupNode = {
        type: 'end_group',
        id: node.id + '_end',
        groupIdx: groupIdx,
        capturing: node.capturing,
        startIdx: inputIndex
      };

      const groupSuccessors = [endGroupNode, ...successors];
      return evaluate(node.body, inputIndex, groupSuccessors, nextGroups, matchedNodeIds, scanStartIdx);
    }

    if (node.type === 'end_group') {
      const groupIdx = node.groupIdx;
      const nextGroups = cloneGroups(currentGroups);
      if (node.capturing) {
        nextGroups[groupIdx].end = inputIndex;
        nextGroups[groupIdx].match = input.slice(node.startIdx, inputIndex);
        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex,
          scanStartIdx,
          status: 'match',
          message: `Captured Group #${groupIdx}: "${nextGroups[groupIdx].match}"`,
          groups: cloneGroups(nextGroups),
          matchedNodeIds: [...matchedNodeIds]
        });
      }
      return evaluate(null, inputIndex, successors, nextGroups, matchedNodeIds, scanStartIdx);
    }

    if (node.type === 'alternation') {
      for (let i = 0; i < node.options.length; i++) {
        const option = node.options[i];
        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex,
          scanStartIdx,
          status: 'try_option',
          message: `Alternation: exploring option ${i + 1} of ${node.options.length}`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds]
        });

        const res = evaluate(option, inputIndex, successors, currentGroups, [...matchedNodeIds, node.id], scanStartIdx);
        if (res.success) return res;

        steps.push({
          id: ++stepCount,
          nodeId: node.id,
          inputIndex,
          scanStartIdx,
          status: 'backtrack',
          message: `Alternation option ${i + 1} failed. Reverting to alternative...`,
          groups: cloneGroups(currentGroups),
          matchedNodeIds: [...matchedNodeIds]
        });
      }

      steps.push({
        id: ++stepCount,
        nodeId: node.id,
        inputIndex,
        scanStartIdx,
        status: 'fail',
        message: `Alternation failed: all options exhausted`,
        groups: cloneGroups(currentGroups),
        matchedNodeIds: [...matchedNodeIds]
      });
      return { success: false };
    }

    if (node.type === 'quantifier') {
      const evalNode = {
        type: 'quantifier_eval',
        id: node.id + '_eval',
        quantifierNode: node,
        count: 0,
        startIndices: [inputIndex],
        groupsHistory: [cloneGroups(currentGroups)]
      };
      return evaluate(evalNode, inputIndex, successors, currentGroups, matchedNodeIds, scanStartIdx);
    }

    if (node.type === 'quantifier_eval') {
      const q = node.quantifierNode;
      const count = node.count;
      const currentIdx = node.startIndices[count];
      const currentG = node.groupsHistory[count];

      const prevIdx = count > 0 ? node.startIndices[count - 1] : -1;
      const emptyMatch = count > 0 && currentIdx === prevIdx;
      const canLoop = count < q.max && !emptyMatch;
      const canStop = count >= q.min;

      if (q.greedy) {
        if (canLoop) {
          steps.push({
            id: ++stepCount,
            nodeId: q.id,
            inputIndex: currentIdx,
            scanStartIdx,
            status: 'try_loop',
            message: `Quantifier ${getQuantifierSymbol(q)}: trying loop repetition ${count + 1}`,
            groups: cloneGroups(currentG),
            matchedNodeIds: [...matchedNodeIds, q.id]
          });

          const nextEvalNode = {
            type: 'quantifier_eval',
            id: node.id,
            quantifierNode: q,
            count: count + 1,
            startIndices: [...node.startIndices],
            groupsHistory: [...node.groupsHistory]
          };

          const captureNode = {
            type: 'quantifier_loop_capture',
            id: q.id + '_capture_' + (count + 1),
            evalNode: nextEvalNode
          };

          const bodySuccessors = [captureNode, nextEvalNode, ...successors];
          const res = evaluate(q.body, currentIdx, bodySuccessors, currentG, [...matchedNodeIds, q.id], scanStartIdx);
          if (res.success) return res;

          steps.push({
            id: ++stepCount,
            nodeId: q.id,
            inputIndex: currentIdx,
            scanStartIdx,
            status: 'backtrack',
            message: `Quantifier ${getQuantifierSymbol(q)}: repetition ${count + 1} failed, backtracking to repeat count ${count}`,
            groups: cloneGroups(currentG),
            matchedNodeIds: [...matchedNodeIds]
          });
        }

        if (canStop) {
          steps.push({
            id: ++stepCount,
            nodeId: q.id,
            inputIndex: currentIdx,
            scanStartIdx,
            status: 'try_successors',
            message: `Quantifier ${getQuantifierSymbol(q)}: matching remaining pattern at loop repetition ${count}`,
            groups: cloneGroups(currentG),
            matchedNodeIds: [...matchedNodeIds, q.id]
          });

          const res = evaluate(null, currentIdx, successors, currentG, [...matchedNodeIds, q.id], scanStartIdx);
          if (res.success) return res;
        }

        return { success: false };
      } else {
        // Non-greedy: prefer stopping first
        if (canStop) {
          steps.push({
            id: ++stepCount,
            nodeId: q.id,
            inputIndex: currentIdx,
            scanStartIdx,
            status: 'try_successors',
            message: `Quantifier ${getQuantifierSymbol(q)} (non-greedy): matching remaining pattern at loop repetition ${count}`,
            groups: cloneGroups(currentG),
            matchedNodeIds: [...matchedNodeIds, q.id]
          });

          const res = evaluate(null, currentIdx, successors, currentG, [...matchedNodeIds, q.id], scanStartIdx);
          if (res.success) return res;
        }

        if (canLoop) {
          steps.push({
            id: ++stepCount,
            nodeId: q.id,
            inputIndex: currentIdx,
            scanStartIdx,
            status: 'try_loop',
            message: `Quantifier ${getQuantifierSymbol(q)} (non-greedy): trying loop repetition ${count + 1}`,
            groups: cloneGroups(currentG),
            matchedNodeIds: [...matchedNodeIds, q.id]
          });

          const nextEvalNode = {
            type: 'quantifier_eval',
            id: node.id,
            quantifierNode: q,
            count: count + 1,
            startIndices: [...node.startIndices],
            groupsHistory: [...node.groupsHistory]
          };

          const captureNode = {
            type: 'quantifier_loop_capture',
            id: q.id + '_capture_' + (count + 1),
            evalNode: nextEvalNode
          };

          const bodySuccessors = [captureNode, nextEvalNode, ...successors];
          const res = evaluate(q.body, currentIdx, bodySuccessors, currentG, [...matchedNodeIds, q.id], scanStartIdx);
          if (res.success) return res;
        }

        return { success: false };
      }
    }

    if (node.type === 'quantifier_loop_capture') {
      node.evalNode.startIndices.push(inputIndex);
      node.evalNode.groupsHistory.push(cloneGroups(currentGroups));
      return evaluate(null, inputIndex, successors, currentGroups, matchedNodeIds, scanStartIdx);
    }

    throw new Error(`Unknown interpreter node type: ${node.type}`);
  }

  // Scan loop: Regex matches anywhere in the string unless bounded by ^
  let onlyAtIndexZero = false;
  if (ast.type === 'anchor' && ast.value === '^') {
    onlyAtIndexZero = true;
  } else if (ast.type === 'sequence' && ast.items.length > 0 && ast.items[0].type === 'anchor' && ast.items[0].value === '^') {
    onlyAtIndexZero = true;
  }

  const maxStartIndex = onlyAtIndexZero ? 0 : input.length;

  for (let startIdx = 0; startIdx <= maxStartIndex; startIdx++) {
    steps.push({
      id: ++stepCount,
      nodeId: 'scan',
      inputIndex: startIdx,
      scanStartIdx: startIdx,
      status: 'scan',
      message: `Scanning: attempting to match pattern starting at index ${startIdx}`,
      groups: {},
      matchedNodeIds: []
    });

    try {
      const res = evaluate(ast, startIdx, [], {}, [], startIdx);
      if (res.success) {
        success = true;
        finalIndex = res.index;
        finalGroups = res.groups;
        steps.push({
          id: ++stepCount,
          nodeId: 'accept',
          inputIndex: finalIndex,
          scanStartIdx: startIdx,
          status: 'success',
          message: `MATCH FOUND! Succeeded from position ${startIdx} to ${finalIndex} ("${input.slice(startIdx, finalIndex)}")`,
          groups: cloneGroups(finalGroups),
          matchedNodeIds: ['accept']
        });
        break;
      }
    } catch (err) {
      // Catch limitations and rethrow
      throw err;
    }

    if (startIdx === maxStartIndex && !success) {
      steps.push({
        id: ++stepCount,
        nodeId: 'fail',
        inputIndex: startIdx,
        scanStartIdx: startIdx,
        status: 'global_fail',
        message: `Match failed: pattern was not found in the test string.`,
        groups: {},
        matchedNodeIds: []
      });
    }
  }

  return { success, steps, finalIndex, groups: finalGroups };
}

// ==========================================
// 4. SVG RENDERER FOR THE DOM
// ==========================================

function renderNodeSVG(node) {
  let html = '';

  if (node.type === 'literal' || node.type === 'escape' || node.type === 'wildcard' || node.type === 'character_class' || node.type === 'anchor') {
    const layout = node.layout;
    html += `
      <g class="svg-node" id="svg-${node.id}" transform="translate(${node.x || 0}, ${node.y || 0})">
        <rect x="0" y="0" width="${layout.width}" height="${layout.height}" rx="6" ry="6" />
        <text x="${layout.width / 2}" y="${layout.height / 2 + 4}" text-anchor="middle">${escapeHTML(layout.label)}</text>
      </g>
    `;
    return html;
  }

  if (node.type === 'sequence') {
    html += `<g id="svg-${node.id}" transform="translate(${node.x || 0}, ${node.y || 0})">`;
    for (let i = 0; i < node.items.length; i++) {
      const item = node.items[i];
      html += renderNodeSVG(item);
      
      if (i < node.items.length - 1) {
        const nextItem = node.items[i + 1];
        const startX = item.x + item.layout.width;
        const startY = item.y + item.layout.exitY;
        const endX = nextItem.x;
        const endY = nextItem.y + nextItem.layout.entryY;
        html += `<path class="svg-flow-line" id="path-to-${nextItem.id}" d="M ${startX} ${startY} L ${endX} ${endY}" marker-end="url(#arrow)" />`;
      }
    }
    html += `</g>`;
    return html;
  }

  if (node.type === 'alternation') {
    const layout = node.layout;
    html += `<g id="svg-${node.id}" transform="translate(${node.x || 0}, ${node.y || 0})">`;

    const entryY = layout.entryY;
    const exitY = layout.exitY;
    html += `<circle class="svg-dot" id="dot-start-${node.id}" cx="15" cy="${entryY}" r="4" />`;
    html += `<circle class="svg-dot" id="dot-end-${node.id}" cx="${layout.width - 15}" cy="${exitY}" r="4" />`;

    html += `<path class="svg-flow-line" id="path-enter-${node.id}" d="M 0 ${entryY} L 15 ${entryY}" />`;
    html += `<path class="svg-flow-line" id="path-exit-${node.id}" d="M ${layout.width - 15} ${exitY} L ${layout.width} ${exitY}" />`;

    for (let i = 0; i < node.options.length; i++) {
      const opt = node.options[i];
      html += renderNodeSVG(opt);

      const startX = 15;
      const startY = entryY;
      const endX = opt.x;
      const endY = opt.y + opt.layout.entryY;
      
      const cp1x = startX + 15;
      const cp1y = startY;
      const cp2x = endX - 15;
      const cp2y = endY;
      
      html += `<path class="svg-flow-line" id="path-branch-${opt.id}" d="M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}" marker-end="url(#arrow)" />`;

      const optExitX = opt.x + opt.layout.width;
      const optExitY = opt.y + opt.layout.exitY;
      const mergeX = layout.width - 15;
      const mergeY = exitY;
      
      const cp3x = optExitX + 15;
      const cp3y = optExitY;
      const cp4x = mergeX - 15;
      const cp4y = mergeY;
      
      html += `<path class="svg-flow-line" id="path-merge-${opt.id}" d="M ${optExitX} ${optExitY} C ${cp3x} ${cp3y}, ${cp4x} ${cp4y}, ${mergeX} ${mergeY}" />`;
    }

    html += `</g>`;
    return html;
  }

  if (node.type === 'quantifier') {
    const layout = node.layout;
    const bodyLayout = node.body.layout;
    html += `<g id="svg-${node.id}" transform="translate(${node.x || 0}, ${node.y || 0})">`;

    html += renderNodeSVG(node.body);

    html += `<path class="svg-flow-line" id="path-enter-${node.body.id}" d="M 0 ${layout.entryY} L ${node.body.x} ${layout.entryY}" marker-end="url(#arrow)" />`;
    html += `<path class="svg-flow-line" id="path-exit-${node.id}" d="M ${node.body.x + bodyLayout.width} ${layout.exitY} L ${layout.width} ${layout.exitY}" />`;

    if (node.min === 0) {
      const startX = 0;
      const startY = layout.entryY;
      const endX = layout.width;
      const endY = layout.exitY;
      const topY = 5;
      
      html += `<path class="svg-flow-line bypass" id="path-bypass-${node.id}" d="M ${startX} ${startY} C 10 ${startY}, 10 ${topY}, 20 ${topY} H ${layout.width - 20} C ${layout.width - 10} ${topY}, ${layout.width - 10} ${endY}, ${endX} ${endY}" marker-end="url(#arrow)" />`;
    }

    if (node.max > 1) {
      const bodyExitX = node.body.x + bodyLayout.width;
      const bodyExitY = layout.exitY;
      const bodyEntryX = node.body.x;
      const bodyEntryY = layout.entryY;
      const bottomY = layout.height - 5;
      
      html += `<path class="svg-flow-line loopback" id="path-loopback-${node.id}" d="M ${bodyExitX} ${bodyExitY} C ${bodyExitX + 10} ${bodyExitY}, ${bodyExitX + 10} ${bottomY}, ${bodyExitX} ${bottomY} H ${bodyEntryX} C ${bodyEntryX - 10} ${bottomY}, ${bodyEntryX - 10} ${bodyEntryY}, ${bodyEntryX} ${bodyEntryY}" marker-end="url(#arrow)" />`;
    }

    html += `</g>`;
    return html;
  }

  if (node.type === 'group') {
    const layout = node.layout;
    const bodyLayout = node.body.layout;
    html += `<g id="svg-${node.id}" transform="translate(${node.x || 0}, ${node.y || 0})">`;

    html += `<rect class="group-box" id="box-${node.id}" x="5" y="16" width="${layout.width - 10}" height="${layout.height - 21}" />`;
    
    const labelText = node.capturing ? `Group #${node.index}` : 'Group (non-capturing)';
    html += `<text class="group-label" id="label-${node.id}" x="8" y="12">${labelText}</text>`;

    html += renderNodeSVG(node.body);

    html += `<path class="svg-flow-line" id="path-enter-${node.body.id}" d="M 0 ${layout.entryY} L ${node.body.x} ${layout.entryY}" marker-end="url(#arrow)" />`;
    html += `<path class="svg-flow-line" id="path-exit-${node.id}" d="M ${node.body.x + bodyLayout.width} ${layout.exitY} L ${layout.width} ${layout.exitY}" />`;

    html += `</g>`;
    return html;
  }

  return '';
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

// ==========================================
// 5. APPLICATION STATE & MAIN LOGIC
// ==========================================

let astRoot = null;
let trace = [];
let activeStepIdx = 0;
let playInterval = null;

// DOM Elements
const regexInput = document.getElementById('regex-input');
const flagI = document.getElementById('flag-i');
const textInput = document.getElementById('text-input');
const regexError = document.getElementById('regex-error');

const btnReset = document.getElementById('btn-reset');
const btnPrev = document.getElementById('btn-prev');
const btnPlay = document.getElementById('btn-play');
const btnNext = document.getElementById('btn-next');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');

const stepCounter = document.getElementById('step-counter');
const timelineSlider = document.getElementById('timeline-slider');
const speedSlider = document.getElementById('speed-slider');
const speedLabel = document.getElementById('speed-label');

const svgContent = document.getElementById('svg-content');
const visualizerSvg = document.getElementById('visualizer-svg');

const statusBadge = document.getElementById('status-badge');
const actionText = document.getElementById('action-text');
const charHighlighter = document.getElementById('char-highlighter');
const groupsList = document.getElementById('groups-list');
const logTerminal = document.getElementById('log-terminal');
const btnClearLogs = document.getElementById('btn-clear-logs');

// Initialize application
function init() {
  setupEventListeners();
  triggerParsing();
}

function setupEventListeners() {
  regexInput.addEventListener('input', triggerParsing);
  flagI.addEventListener('change', triggerParsing);
  textInput.addEventListener('input', triggerParsing);

  btnReset.addEventListener('click', () => {
    pause();
    jumpToStep(0);
  });

  btnPrev.addEventListener('click', () => {
    pause();
    if (activeStepIdx > 0) {
      jumpToStep(activeStepIdx - 1);
    }
  });

  btnNext.addEventListener('click', () => {
    pause();
    if (activeStepIdx < trace.length - 1) {
      jumpToStep(activeStepIdx + 1);
    }
  });

  btnPlay.addEventListener('click', () => {
    if (playInterval) {
      pause();
    } else {
      play();
    }
  });

  timelineSlider.addEventListener('input', () => {
    pause();
    jumpToStep(parseInt(timelineSlider.value, 10));
  });

  speedSlider.addEventListener('input', () => {
    speedLabel.textContent = `${speedSlider.value}ms`;
    if (playInterval) {
      pause();
      play();
    }
  });

  btnClearLogs.addEventListener('click', () => {
    pause();
    jumpToStep(0);
  });
}

function triggerParsing() {
  pause();
  const pattern = regexInput.value;
  const testString = textInput.value;

  if (!pattern) {
    showError("Please enter a regular expression");
    clearVisualization();
    return;
  }

  try {
    const parser = new RegexParser(pattern);
    astRoot = parser.parse();
    hideError();

    // 1. Generate Layout
    layoutNode(astRoot);

    // 2. Render SVG Flowchart
    const html = renderNodeSVG(astRoot);
    svgContent.innerHTML = html;

    const w = astRoot.layout.width + 50;
    const h = astRoot.layout.height + 50;
    visualizerSvg.setAttribute('viewBox', `-25 -25 ${w} ${h}`);

    // 3. Perform Match Tracing
    const caseInsensitive = flagI.checked;
    const matchResult = match(astRoot, testString, caseInsensitive);
    trace = matchResult.steps;

    // 4. Setup Timeline controls
    timelineSlider.max = trace.length - 1;
    timelineSlider.value = 0;

    // 5. Render Logs inside Terminal
    renderLogTerminal();

    // 6. Jump to first step
    jumpToStep(0);

  } catch (err) {
    showError(err.message);
    clearVisualization();
  }
}

function showError(msg) {
  regexError.textContent = msg;
  regexError.classList.remove('hidden');
  regexInput.classList.add('invalid');
}

function hideError() {
  regexError.classList.add('hidden');
  regexInput.classList.remove('invalid');
}

function clearVisualization() {
  svgContent.innerHTML = '';
  trace = [];
  activeStepIdx = 0;
  timelineSlider.max = 0;
  timelineSlider.value = 0;
  stepCounter.textContent = 'Step 0 / 0';
  statusBadge.className = 'badge idle';
  statusBadge.textContent = 'Idle';
  actionText.textContent = 'Enter a valid pattern to debug.';
  charHighlighter.innerHTML = '<span class="placeholder-text">Waiting for input...</span>';
  groupsList.innerHTML = '<tr><td colspan="3" class="empty-state">No active groups</td></tr>';
  logTerminal.innerHTML = '<div class="log-line system">Ready. Waiting for valid inputs...</div>';
}

function renderLogTerminal() {
  logTerminal.innerHTML = '';
  trace.forEach((step, idx) => {
    const line = document.createElement('div');
    line.className = `log-line ${step.status}`;
    line.id = `log-${step.id}`;
    
    // Prefix status colors and numbers
    const numSpan = document.createElement('span');
    numSpan.className = 'log-num';
    numSpan.textContent = step.id;
    line.appendChild(numSpan);

    const txtSpan = document.createElement('span');
    txtSpan.textContent = step.message;
    line.appendChild(txtSpan);

    // Event listener to jump to step on click
    line.addEventListener('click', () => {
      pause();
      jumpToStep(idx);
    });

    logTerminal.appendChild(line);
  });
}

function jumpToStep(idx) {
  if (trace.length === 0) return;
  
  // Bound check
  activeStepIdx = Math.max(0, Math.min(idx, trace.length - 1));
  updateVisuals(activeStepIdx);
}

function updateVisuals(idx) {
  const step = trace[idx];
  if (!step) return;

  // 1. Update text and timeline slider
  stepCounter.textContent = `Step ${idx + 1} / ${trace.length}`;
  timelineSlider.value = idx;
  actionText.textContent = step.message;

  // 2. Update Badge Status
  statusBadge.textContent = getBadgeText(step.status);
  statusBadge.className = `badge ${getBadgeClass(step.status)}`;

  // 3. Highlight Test String Characters
  highlightTestString(step);

  // 4. Update SVG Diagram Highlights
  highlightSVGDiagram(step);

  // 5. Update Capture Groups
  updateCaptureGroupsTable(step);

  // 6. Highlight Active Log Line in Terminal
  const activeLines = logTerminal.querySelectorAll('.log-line.active');
  activeLines.forEach(l => l.classList.remove('active'));

  const currentLogLine = document.getElementById(`log-${step.id}`);
  if (currentLogLine) {
    currentLogLine.classList.add('active');
    currentLogLine.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function highlightTestString(step) {
  const text = textInput.value;
  charHighlighter.innerHTML = '';

  if (text.length === 0) {
    charHighlighter.innerHTML = '<span class="placeholder-text">Empty test string</span>';
    return;
  }

  for (let k = 0; k < text.length; k++) {
    const span = document.createElement('span');
    span.className = 'char';
    span.textContent = text[k];

    // Style according to scanning index and matcher state
    if (k < step.scanStartIdx) {
      span.classList.add('scanned');
    } else if (k === step.inputIndex) {
      span.classList.add('inspecting');
      if (step.status === 'fail' || step.status === 'global_fail') {
        span.classList.add('fail');
      } else if (step.status === 'backtrack') {
        span.classList.add('backtracking');
      }
    } else if (k >= step.scanStartIdx && k < step.inputIndex) {
      span.classList.add('matched');
    }

    charHighlighter.appendChild(span);
  }
}

function highlightSVGDiagram(step) {
  // Clear all previous highlight classes in SVG
  const nodes = svgContent.querySelectorAll('.svg-node');
  nodes.forEach(n => n.classList.remove('active', 'matched', 'failed'));

  const paths = svgContent.querySelectorAll('.svg-flow-line');
  paths.forEach(p => {
    p.classList.remove('active', 'matched', 'failed');
    p.setAttribute('marker-end', 'url(#arrow)');
  });

  const boxes = svgContent.querySelectorAll('.group-box');
  boxes.forEach(b => b.classList.remove('active', 'matched'));

  const dots = svgContent.querySelectorAll('.svg-dot');
  dots.forEach(d => d.classList.remove('active', 'matched', 'failed'));

  // A. Highlight Matched Nodes and Paths
  step.matchedNodeIds.forEach(id => {
    // Highlight matched nodes
    const nodeEl = document.getElementById(`svg-${id}`);
    if (nodeEl) nodeEl.classList.add('matched');

    // Highlight exit path of matched node if sequence path exists
    const pathNext = document.getElementById(`path-to-${id}`);
    if (pathNext) {
      pathNext.classList.add('matched');
      pathNext.setAttribute('marker-end', 'url(#arrow-success)');
    }

    // Highlight branch/merge paths for alternation option
    const pathBranch = document.getElementById(`path-branch-${id}`);
    if (pathBranch) {
      pathBranch.classList.add('matched');
      pathBranch.setAttribute('marker-end', 'url(#arrow-success)');
    }
    const pathMerge = document.getElementById(`path-merge-${id}`);
    if (pathMerge) pathMerge.classList.add('matched');

    // Highlight loop entry/exit/loopback for quantifier
    const pathEnter = document.getElementById(`path-enter-${id}`);
    if (pathEnter) {
      pathEnter.classList.add('matched');
      pathEnter.setAttribute('marker-end', 'url(#arrow-success)');
    }

    // Highlight group box
    const boxEl = document.getElementById(`box-${id}`);
    if (boxEl) boxEl.classList.add('matched');
  });

  // B. Highlight Active Node
  if (step.nodeId && step.nodeId !== 'scan' && step.nodeId !== 'accept') {
    const activeNodeEl = document.getElementById(`svg-${step.nodeId}`);
    if (activeNodeEl) {
      const cls = getSVGHighlightClass(step.status);
      activeNodeEl.classList.add(cls);

      // Highlight active transition lines pointing to active node
      const pathEnter = document.getElementById(`path-enter-${step.nodeId}`);
      if (pathEnter) {
        pathEnter.classList.add(cls);
        if (cls === 'active') pathEnter.setAttribute('marker-end', 'url(#arrow-active)');
        else if (cls === 'matched') pathEnter.setAttribute('marker-end', 'url(#arrow-success)');
      }

      const pathBranch = document.getElementById(`path-branch-${step.nodeId}`);
      if (pathBranch) {
        pathBranch.classList.add(cls);
        if (cls === 'active') pathBranch.setAttribute('marker-end', 'url(#arrow-active)');
        else if (cls === 'matched') pathBranch.setAttribute('marker-end', 'url(#arrow-success)');
      }

      const pathNext = document.getElementById(`path-to-${step.nodeId}`);
      if (pathNext) {
        pathNext.classList.add(cls);
        if (cls === 'active') pathNext.setAttribute('marker-end', 'url(#arrow-active)');
        else if (cls === 'matched') pathNext.setAttribute('marker-end', 'url(#arrow-success)');
      }
    }

    // Highlight active group box
    const boxEl = document.getElementById(`box-${step.nodeId}`);
    if (boxEl) boxEl.classList.add('active');
  }
}

function updateCaptureGroupsTable(step) {
  groupsList.innerHTML = '';
  const keys = Object.keys(step.groups).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  if (keys.length === 0) {
    groupsList.innerHTML = '<tr><td colspan="3" class="empty-state">No active groups</td></tr>';
    return;
  }

  keys.forEach(k => {
    const group = step.groups[k];
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.className = 'group-name';
    tdName.textContent = `Group #${k}`;
    tr.appendChild(tdName);

    const tdVal = document.createElement('td');
    tdVal.className = 'group-val';
    tdVal.textContent = group.end !== null ? `"${group.match}"` : 'matching...';
    tr.appendChild(tdVal);

    const tdSpan = document.createElement('td');
    tdSpan.className = 'group-span';
    tdSpan.textContent = group.end !== null ? `[${group.start}, ${group.end}]` : `[${group.start}, -]`;
    tr.appendChild(tdSpan);

    groupsList.appendChild(tr);
  });
}

function getBadgeText(status) {
  switch (status) {
    case 'scan': return 'Scanning';
    case 'try': return 'Inspecting';
    case 'try_option': return 'Branching';
    case 'try_loop': return 'Looping';
    case 'try_successors': return 'Checking Ahead';
    case 'match': return 'Match Success';
    case 'backtrack': return 'Backtracking';
    case 'fail': return 'Step Failed';
    case 'success':
    case 'global_success': return 'Pattern Matched';
    case 'global_fail': return 'Match Failed';
    default: return 'Running';
  }
}

function getBadgeClass(status) {
  switch (status) {
    case 'scan':
    case 'try':
    case 'try_option':
    case 'try_loop':
    case 'try_successors':
      return 'scan';
    case 'match':
    case 'success':
    case 'global_success':
      return 'success';
    case 'backtrack':
      return 'backtrack';
    case 'fail':
    case 'global_fail':
      return 'failed';
    default:
      return 'idle';
  }
}

function getSVGHighlightClass(status) {
  switch (status) {
    case 'match':
    case 'success':
    case 'global_success':
      return 'matched';
    case 'fail':
    case 'global_fail':
      return 'failed';
    case 'backtrack':
      return 'failed';
    default:
      return 'active';
  }
}

// Player control loops
function play() {
  if (playInterval) return;
  const speed = parseInt(speedSlider.value, 10);

  playIcon.classList.add('hidden');
  pauseIcon.classList.remove('hidden');

  // If at the end, reset first
  if (activeStepIdx >= trace.length - 1) {
    activeStepIdx = 0;
    updateVisuals(activeStepIdx);
  }

  playInterval = setInterval(() => {
    if (activeStepIdx < trace.length - 1) {
      activeStepIdx++;
      updateVisuals(activeStepIdx);
    } else {
      pause();
    }
  }, speed);
}

function pause() {
  if (!playInterval) return;
  clearInterval(playInterval);
  playInterval = null;

  playIcon.classList.remove('hidden');
  pauseIcon.classList.add('hidden');
}

// Start visualizer
init();
