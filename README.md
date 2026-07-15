# Regex Lens 🔍

Regex Lens is an interactive, step-by-step state-transition parser and NFA visualizer designed to demystify regular expression matching and backtracking behavior.

Instead of treating regex execution as a black box, Regex Lens parses patterns into abstract syntax tree (AST) networks, generates custom railroad flowcharts, and steps through the matching state machine interactively.

---

## Features

- **Custom AST Parser:** Breaks down regular expressions into structural nodes including literals, escape sequences, wildcards (`.`), character sets (`[...]`), alternations (`a|b`), capturing and non-capturing groups, and quantifiers (`*`, `+`, `?`, `{min,max}`).
- **State-Transition Flowchart:** Renders clean, dynamic railroad diagrams directly to SVG, utilizing recursive spatial calculations, custom branching paths, and quantifier loopbacks.
- **Visual Debugger Controls:** Stop, Play/Pause, Step Forward, Step Backward, and Scrub through the match timeline. Adjustable matching speed (using a clever reverse-log range).
- **Test String Inspector:** Shows character-by-character inspection status in real-time, coloring chars green (matched), blue (inspecting), yellow (backtracking), or grey (scanned/skipped).
- **Backtracking Log:** A step-by-step trace showing why branches failed and how the engine backtracks to alternative choices, allowing you to click any log row to jump directly to that state.
- **Capture Groups Monitor:** Watch capture groups populate, track group spans, and see how values change dynamically during backtracking and recursive matches.

---

## Architecture & Code Structure

The project has three main core components inside [app.js](file:///C:/Projects/regex-lens/app.js):

### 1. The Parser (`RegexParser`)
A custom recursive descent parser that lexes the pattern string character by character, parses groups, handles character class ranges, supports escapes, and validates balanced groupings, compiling them into a nested object tree.

### 2. The Layout Engine (`layoutNode`)
A dynamic block-and-coordinate generator that recursively measures child dimensions (`width`, `height`) and sets relative starting/ending coordinates (`entryY`, `exitY`) for structural groups.

### 3. The Match Machine (`match`)
A continuation-passing style (CPS) recursive-evaluator. It matches literal values, translates character classes, and manages quantifiers. It captures detailed snapshots of:
- **`inputIndex`**: Current pointer position in the test string.
- **`scanStartIdx`**: Scanning index offset.
- **`matchedNodeIds`**: Active successfully matched nodes list.
- **`groups`**: State of capture groups at this specific execution point.
- **`status`**: Current operation label (`try`, `match`, `backtrack`, `fail`, `success`).

---

## File Structure

```
C:\Projects\regex-lens\
├── index.html       # App layout, controls, log terminal, group list
├── styles.css       # Layout grid, SVG nodes/paths, animations, dark mode
├── app.js           # Parser parser, Layout engine, Match state machine
├── package.json     # Vite runner config
├── .gitignore       # Ignore node_modules & build artifacts
└── README.md        # Technical specifications & overview
```

---

## Getting Started

1. Clone or navigate to the directory:
   ```bash
   cd C:\Projects\regex-lens
   ```
2. Install the dev dependencies:
   ```bash
   npm install
   ```
3. Run the Vite development server:
   ```bash
   npm run dev
   ```
4. Open the displayed local server URL (typically `http://localhost:5173`) in your browser to start debugging regular expressions step-by-step!
