# Security

## Why a data block needs escaping

Text inside `<script>` is not HTML-escaped by the browser: the element ends at the first `</script`
followed by a space, `/` or `>`, in any case, and `<!--` changes how the tokenizer reads what follows.
So any string your graph carries from a CMS or a user can break out of the block unless it is escaped.

## What jsonld-stitch does

After `JSON.stringify`, jsonld-stitch escapes `<`, `>`, `&`, U+2028 and U+2029 as `\u003c`, `\u003e`,
`\u0026`, `\u2028` and `\u2029`, the same set Next.js uses for its own inline data. These characters can
only appear inside JSON strings (keys and values alike), where the escape decodes back to the original
character, so:

- **it is safe**: no `<` ever reaches the HTML, so no end tag, comment or CDATA marker can form;
- **it is lossless**: `JSON.parse` of the block gives back exactly what `JSON.stringify` wrote.

Escaping `<` alone, as the Next.js docs show, is already safe for HTML. `>` and `&` are defence in
depth, for readers that treat the block as XML or as markup, and U+2028/U+2029 keep the text valid in
JavaScript engines older than ES2019.

## What other approaches get wrong

- Replacing only `</script>` misses `</script >`, `</SCRIPT/` and similar spellings.
- Escaping strings as HTML entities (`&amp;`, `&lt;`) is safe but changes your data, because nothing
  decodes entities inside a script.

jsonld-stitch's test suite runs these inputs, and more (lone surrogates, `]]>`, attacker-controlled keys,
`toJSON` returning markup), through a spec-compliant HTML parser.

## Rendering

Rendering uses `dangerouslySetInnerHTML` with the escaped string, never React's own text escaping, so the
output is the same on React 18 and 19. The type switch on hidden content (see
[design](design.md#hidden-content)) only moves between two data-block types, so it never makes a block
executable.

## Values that throw

A `BigInt`, a cycle, or a getter or `toJSON` that throws makes `JSON.stringify` throw, so `<JsonLd>`
throws during render, as a hand-written `<script>` would. Catch it with an error boundary, or keep
structured data to plain JSON values.
