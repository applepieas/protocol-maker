# CLAUDE.md — Protocol Maker

AI coding assistant guidelines for this project. Read this before writing any code.

---

## What This App Is

A **Czech high-school lab protocol generator**. Students upload images/spreadsheets from lab experiments; the app uses AI (via OpenRouter) to generate a structured lab report. The report has two panes: a TipTap rich-text document (left) and a Fortune-Sheet data table (right).

Key domain knowledge:
- UI text and database content are in **Czech**
- Lab data uses **decimal commas** (not dots) — always normalize when processing numbers
- The AI generates TipTap JSON and Fortune-Sheet `celldata` — both must be validated before use

---

## Project Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React 19, TypeScript strict) |
| Styling | Tailwind CSS v4 + SCSS modules, no `tailwind.config.js` |
| Rich text | TipTap v3 (`@tiptap/react`) — client-only |
| Spreadsheet | `@fortune-sheet/react` v1.0.4 — client-only |
| Auth + DB | Supabase (`@supabase/ssr` + `@supabase/supabase-js`) |
| AI | OpenRouter API (Claude via `OPENROUTER_API_KEY`) |
| UI components | shadcn/ui (radix-nova style, base=radix, icons=lucide) |
| Package manager | pnpm (single package, NOT a monorepo) |

---

## 1. Next.js 16 App Router

### Server vs. Client Components

All `app/` files are **Server Components by default**. Add `'use client'` only at the boundary where interactivity begins.

**Server Components** — data fetching, layouts, pages, keeping secrets (no `NEXT_PUBLIC_` prefix)
**Client Components** — `useState`, `useEffect`, event handlers, browser APIs, TipTap, FortuneSheet

Push the `'use client'` boundary as deep into the tree as possible.

### `params` are Promises in Next.js 15+

```ts
// Correct
export default async function Page({ params }: { params: Promise<{ protocolId: string }> }) {
  const { protocolId } = await params
}
```

### Route Handlers (`app/api/**/route.ts`)

- Named exports: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`
- GET handlers are **uncached by default** in Next.js 15+
- Return `new Response(...)` or `NextResponse`
- For SSE (streaming AI): return a `ReadableStream` with `Content-Type: text/event-stream`

```ts
// SSE pattern
export async function POST(request: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'log', message: 'Starting' })}\n\n`))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
```

### Middleware

Lives at project root `middleware.ts`. Calls `updateSession()` from `lib/supabase/middleware.ts` to refresh Supabase auth tokens on every request.

### Preventing Environment Poisoning

```ts
import 'server-only'  // in lib/supabase/queries.ts — hard-fails if imported client-side
```

---

## 2. Tailwind CSS v4

No `tailwind.config.js`. All config is in `app/globals.css` via `@theme`.

### PostCSS

```js
// postcss.config.mjs — already set up
export default { plugins: { "@tailwindcss/postcss": {} } }
```

### Adding Design Tokens

1. Add `--my-color: oklch(...)` to `styles/_variables.css` under `:root` and `.dark`
2. Add `--color-my-color: var(--my-color)` inside the `@theme inline` block in `globals.css`
3. Use as `bg-my-color`, `text-my-color` in JSX

### Breaking Changes from v3 — Do NOT Use These

| v3 (wrong) | v4 (correct) |
|---|---|
| `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| `bg-opacity-50`, `text-opacity-*` | `bg-black/50`, `text-black/50` |
| `flex-shrink-0`, `flex-grow` | `shrink-0`, `grow` |
| `shadow-sm` | `shadow-xs` |
| `shadow` (default) | `shadow-sm` |
| `blur-sm` | `blur-xs` |
| `rounded-sm` | `rounded-xs` |
| `rounded` (default) | `rounded-sm` |
| `outline-none` | `outline-hidden` |
| `ring` (3px default) | `ring-3` |
| `!flex` (important prefix) | `flex!` (important suffix) |
| `@layer utilities { .foo {} }` | `@utility foo {}` |
| `bg-[--my-var]` | `bg-(--my-var)` |
| `overflow-ellipsis` | `text-ellipsis` |

### Dark Mode

```css
/* already in globals.css */
@custom-variant dark (&:is(.dark *));
```

`next-themes` applies `.dark` to `<html>`. Use `dark:` prefix as normal.

---

## 3. TipTap (v3)

### Critical Rules

- **Always `'use client'`** — never render TipTap in a Server Component
- **`immediatelyRender: false` is MANDATORY** — without it Next.js throws hydration errors
- **Never import TipTap extensions in Server Components** — they reference `document` / `window`

### Basic Setup

```tsx
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

export function Editor({ content }: { content?: object }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    immediatelyRender: false,  // REQUIRED
  })
  return <EditorContent editor={editor} />
}
```

### Extensions in This Project

StarterKit, Image, TaskItem/TaskList, TextAlign, Typography, Highlight, Subscript, Superscript, Mathematics (KaTeX), ImageUploadNode, HorizontalRule, NodeBackgroundExtension (custom)

### TipTap JSON Format (what the AI generates)

```json
{
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 2, "textAlign": "left" },
      "content": [{ "type": "text", "text": "Nadpis" }] },
    { "type": "paragraph", "attrs": { "textAlign": "left" },
      "content": [
        { "type": "text", "marks": [{ "type": "bold" }], "text": "Tučný text" },
        { "type": "text", "text": " normální text" }
      ]
    }
  ]
}
```

The AI-generated protocol has 9 sections: `title`, `tema`, `datum`, `úkoly`, `teorie`, `pomůcky`, `postup`, `výsledky`, `závěr`

### Reading / Setting Content

```ts
editor.getJSON()                          // for storage
editor.commands.setContent(jsonDoc)       // replace all
editor.chain().focus().run()              // chain
```

### Common Pitfalls

- Don't set `content` on `useEditor` AND call `setContent()` on the same data — double-render
- `@tiptap/extension-mathematics` requires `katex` CSS imported separately
- To reload editor content from DB: use a `useEffect` + `setContent()`, or pass new `content` with `key` prop to remount
- Do NOT hand-edit files in `components/tiptap-*` — they are a vendored template

### Do Not Touch

- `components/text-editor.tsx` — main split-pane component
- `components/tiptap-templates/` — vendored TipTap starter template
- `components/tiptap-extension/`, `tiptap-node/`, `tiptap-ui/`, `tiptap-ui-primitive/` — vendored
- `hooks/use-tiptap-editor.ts`, `lib/tiptap-utils.ts` — vendored utilities

---

## 4. FortuneSheet (`@fortune-sheet/react`)

### Critical Rules

- **Always `'use client'`** — never render server-side
- **Container needs explicit height** — `height: auto` makes the sheet invisible
- **Import CSS** — without it the sheet renders unstyled

```tsx
'use client'
import { Workbook } from '@fortune-sheet/react'
import '@fortune-sheet/react/dist/index.css'

// Container must have explicit height:
<div style={{ width: '100%', height: '600px' }}>
  <Workbook data={sheets} lang="en" />
</div>
```

### Sheet Data Structure

```ts
// Use celldata (sparse) for INITIALIZATION, not data (dense 2D array)
type SheetData = {
  name: string
  id?: string      // was 'index' in Luckysheet — RENAMED, use 'id'
  status?: number  // 1 = active
  celldata?: CellEntry[]  // use this for init
  data?: CellValue[][]    // FortuneSheet fills this after mount
}

type CellEntry = { r: number; c: number; v: CellValue }

type CellValue = {
  v?: string | number  // stored value
  m?: string           // display text (use for Czech decimal formatting: "3,14")
  t?: 'n' | 's'        // type: number | string (used in this project's lib/utils/sheet.ts)
  bl?: 0 | 1           // bold (1 = bold, used for headers)
}
```

### Czech Decimal Formatting

The project stores numbers with Czech comma decimals in the `m` (display) field:
- `v: 3.14` (actual number), `m: "3,14"` (display string)
- Never store `3,14` as the `v` value — it will break calculations
- `lib/utils/sheet.ts` handles this conversion; use it

### Ref API

```ts
import { type WorkbookInstance } from '@fortune-sheet/react'
const ref = useRef<WorkbookInstance>(null)
ref.current?.getCellValue(row, col)
ref.current?.getAllSheets()
ref.current?.setCellValue(row, col, value)
ref.current?.applyOp(ops)
```

### Common Pitfalls

- `sheet.index` does NOT exist — it is `sheet.id` (breaking change from Luckysheet)
- Paste interception and decimal comma normalization are already handled in `components/text-editor.tsx` — do not add duplicate logic elsewhere
- The `text-editor.tsx` component already wraps FortuneSheet — do not create another wrapper

---

## 5. Supabase

### Which Client to Use

| Location | Client |
|---|---|
| Server Components, Route Handlers | `import { createClient } from '@/lib/supabase/server'` |
| Client Components | `import { createClient } from '@/lib/supabase/client'` |
| `middleware.ts` | `lib/supabase/middleware.ts` `updateSession()` |

### Security Rule — Critical

**Always use `supabase.auth.getUser()` in server code.** Never `getSession()` for protection — it does not validate the JWT signature.

```ts
// Correct
const { data: { user } } = await supabase.auth.getUser()
if (!user) return new Response('Unauthorized', { status: 401 })
```

### Database Types (`lib/types/database.ts`)

```ts
type Protocol = {
  id: string
  user_id: string
  title: string
  zadani: string | null     // assignment text
  postup: string | null     // procedure text
  pomucky: string | null    // equipment text
  tiptap_doc: Record<string, unknown> | null
  sheet_data: Record<string, unknown>[] | null
  status: 'draft' | 'generating' | 'done' | 'error'
  created_at: string
  updated_at: string
}
type Profile = { id: string; display_name: string | null; created_at: string }
```

### DB Query Functions (`lib/supabase/queries.ts`)

These are the only DB functions — do not add raw Supabase queries elsewhere:
- `getProtocols()` — list user's protocols
- `getProtocol(id)` — fetch single protocol
- `createProtocol(title, zadani?, postup?, pomucky?)` — creates draft
- `saveProtocolOutput(id, tiptapDoc, sheetData)` — saves AI output
- `updateProtocolStatus(id, status)` — updates status field

This file uses `'use server only'` — never import it in client components.

### Storage

Bucket: `protocol-uploads`. Files stored as `{userId}/{protocolId}/{filename}`.

```ts
const { data } = await supabase.storage.from('protocol-uploads').download(storagePath)
```

### Route Protection (Middleware)

`middleware.ts` at project root calls `updateSession()`. Protected paths:
- `/dashboard`, `/editor`, `/new-protocol` — require auth
- `/login`, `/register`, `/forgot-password`, `/reset-password` — auth pages
- `/auth/callback` — OAuth callback

---

## 6. shadcn/ui

This project uses shadcn/ui with **radix-nova** style, **radix** base (not base), **lucide** icons.

Add components with: `pnpm dlx shadcn@latest add <component-name>`
Components land in `components/ui/`. Do not hand-edit them unless intentional.

### Critical Rules (from .agents/skills/shadcn/)

**Styling:**
- `className` for layout/positioning only — never override component colors or typography
- Use `gap-*` for spacing, never `space-x-*` or `space-y-*`
- Use `size-*` when width = height (e.g. `size-10` not `w-10 h-10`)
- Use `truncate` not `overflow-hidden text-ellipsis whitespace-nowrap`
- Use semantic color tokens: `bg-primary`, `text-muted-foreground` — never `bg-blue-500`
- Never add manual `z-index` to overlays (Dialog, Sheet, Popover handle their own stacking)
- Use `cn()` from `@/lib/utils` for conditional classes

**Components:**
- `Button` loading state: compose with `Spinner` + `data-icon` + `disabled` — no `isPending` prop
- Icons in `Button`: use `data-icon="inline-start"` or `data-icon="inline-end"` — no `size-4` on icons
- `Avatar` always needs `AvatarFallback`
- `Dialog`, `Sheet`, `Drawer` always need a `Title` (use `className="sr-only"` if hidden)
- Use `Alert` not custom divs for callouts
- Use `Skeleton` not custom `animate-pulse` divs
- Use `Separator` not `<hr>` or `border-t` divs
- Use `Badge` not custom styled spans

**Forms:**
- `FieldGroup` + `Field` for form layout — not `div` with `space-y-*`
- Validation: `data-invalid` on `Field`, `aria-invalid` on the control

**Component Selection:**

| Need | Use |
|---|---|
| Dropdown menu | `DropdownMenu` |
| Side panel | `Sheet` |
| Modal | `Dialog` |
| Confirmation | `AlertDialog` |
| Toast | `sonner` → `toast()` |
| Navigation sidebar | `Sidebar` (already installed) |
| Loading placeholder | `Skeleton` |
| Status indicator | `Badge` |

---

## 7. Project File Structure

```
app/
  (auth)/              — login, register, forgot-password, reset-password
  api/
    auth/callback/     — Supabase OAuth callback
    generate-protocol/ — SSE route handler (POST)
  dashboard/           — protocol list
  editor/[protocolId]/ — split-pane editor page
  new-protocol/        — new protocol form
  page.tsx             — landing page (checks auth, redirects)
  layout.tsx           — root layout (ThemeProvider, Geist fonts)
  globals.css          — Tailwind v4 @theme + CSS vars
components/
  text-editor.tsx      — main split-pane (TipTap + FortuneSheet) — DO NOT TOUCH
  app-sidebar.tsx      — dashboard sidebar
  hero-section.tsx     — landing page hero
  tiptap-*             — vendored TipTap template — DO NOT TOUCH
  ui/                  — shadcn/ui components
lib/
  ai/
    files.ts           — file processing (image→base64, xlsx→CSV)
    prompts.ts         — AI system prompts (Czech lab protocol)
  supabase/
    client.ts          — browser client (for Client Components)
    server.ts          — server client (for Server Components / Route Handlers)
    middleware.ts      — token refresh for middleware.ts
    queries.ts         — typed DB functions (server-only)
  types/database.ts    — Protocol, Profile, ProtocolFile types
  utils/sheet.ts       — FortuneSheet data conversion
  tiptap-utils.ts      — TipTap utilities (vendored) — DO NOT TOUCH
  utils.ts             — cn() utility
styles/
  _variables.css       — CSS custom properties (mapped into Tailwind via @theme inline)
  _keyframe-animations.css
hooks/                 — custom React hooks (mostly vendored TipTap hooks)
middleware.ts          — project root, runs updateSession()
```

---

## 8. AI Pipeline Conventions

### SSE Event Types

The generate-protocol route emits these event shapes — always use discriminated unions:

```ts
type SSEEvent =
  | { type: 'log'; message: string }
  | { type: 'done'; tiptapDoc: Record<string, unknown>; sheetData: Record<string, unknown>[] }
  | { type: 'error'; message: string; detail?: string }
```

### Client-Side SSE Consumption

```ts
const response = await fetch('/api/generate-protocol', { method: 'POST', body: formData })
const reader = response.body!.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const chunk = decoder.decode(value)
  for (const line of chunk.split('\n')) {
    if (line.startsWith('data: ')) {
      const event: SSEEvent = JSON.parse(line.slice(6))
      if (event.type === 'done') { /* use event.tiptapDoc and event.sheetData */ }
    }
  }
}
```

### Validate AI Output Before Use

Always check AI-generated TipTap JSON and sheet data before passing to components:

```ts
// Minimum validation
const isValidTiptapDoc = (doc: unknown): doc is Record<string, unknown> =>
  typeof doc === 'object' && doc !== null && (doc as Record<string, unknown>).type === 'doc'
```

---

## 9. TypeScript Patterns

Strict mode is enabled. Common patterns in this codebase:

```ts
// Optional chaining + nullish coalescing (prefer over non-null assertion)
const name = profile?.display_name ?? user?.email ?? 'Uživatel'

// Discriminated union for protocol status
type ProtocolStatus = 'draft' | 'generating' | 'done' | 'error'

// Async page with awaited params (Next.js 15+)
export default async function Page({ params }: { params: Promise<{ protocolId: string }> }) {
  const { protocolId } = await params
}

// Server action return type
type ActionResult = { success: true; id: string } | { success: false; error: string }
```

---

## 10. pnpm Commands

```bash
pnpm install          # install dependencies (never npm install or yarn)
pnpm add <pkg>        # runtime dep
pnpm add -D <pkg>     # dev dep
pnpm dev              # dev server (Turbopack enabled)
pnpm build
pnpm lint
pnpm dlx shadcn@latest add <component>   # add shadcn component
```

Do NOT use `npm` or `yarn` — this project has a `pnpm-lock.yaml`.

---

## 11. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=            # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=       # Supabase anon key (safe for client)
OPENROUTER_API_KEY=                  # Server-only — never expose to client
NEXT_PUBLIC_APP_URL=                 # e.g. http://localhost:3000
```

`OPENROUTER_API_KEY` must NEVER appear in a `NEXT_PUBLIC_` variable or in client components.

---

## Sources

- [TipTap Next.js Docs](https://tiptap.dev/docs/editor/getting-started/install/nextjs)
- [FortuneSheet Docs](https://ruilisi.github.io/fortune-sheet-docs/)
- [FortuneSheet GitHub](https://github.com/ruilisi/fortune-sheet)
- [Tailwind CSS v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
- [Supabase SSR Client Setup](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase Next.js Auth Guide](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
