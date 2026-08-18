/** Extra Tree-sitter parsers used by fenced Markdown code blocks. */

import { addDefaultParsers, type FiletypeParserOptions } from "@opentui/core";

const PARSERS: FiletypeParserOptions[] = [
  {
    filetype: "go",
    wasm: "https://github.com/tree-sitter/tree-sitter-go/releases/download/v0.25.0/tree-sitter-go.wasm",
    queries: {
      highlights: [
        "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/master/queries/go/highlights.scm",
      ],
    },
  },
  {
    filetype: "python",
    wasm: "https://github.com/tree-sitter/tree-sitter-python/releases/download/v0.23.6/tree-sitter-python.wasm",
    queries: {
      highlights: [
        "https://github.com/tree-sitter/tree-sitter-python/raw/refs/heads/master/queries/highlights.scm",
      ],
    },
  },
  {
    filetype: "bash",
    wasm: "https://github.com/tree-sitter/tree-sitter-bash/releases/download/v0.25.0/tree-sitter-bash.wasm",
    queries: {
      highlights: [
        "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/master/queries/bash/highlights.scm",
      ],
    },
  },
  {
    filetype: "rust",
    wasm: "https://github.com/tree-sitter/tree-sitter-rust/releases/download/v0.24.0/tree-sitter-rust.wasm",
    queries: {
      highlights: [
        "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/master/queries/rust/highlights.scm",
      ],
    },
  },
];

/** Register common coding-language parsers before first Markdown render. */
export function registerCodeParsers(): void {
  addDefaultParsers(PARSERS);
}
