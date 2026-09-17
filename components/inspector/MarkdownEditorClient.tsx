"use client";

import { MDXEditor, CodeMirrorEditor, headingsPlugin, listsPlugin, quotePlugin, linkPlugin, linkDialogPlugin, imagePlugin, tablePlugin, thematicBreakPlugin, codeBlockPlugin, codeMirrorPlugin, markdownShortcutPlugin } from "@mdxeditor/editor";

export function MarkdownEditorClient({ markdown, onChange, darkMode }: { markdown: string; onChange: (value: string) => void; darkMode: boolean }) {
  return <MDXEditor markdown={markdown} onChange={onChange} placeholder="Write notes…" className={`travel-markdown-editor ${darkMode ? "dark-theme" : ""}`} contentEditableClassName="min-h-44 text-sm leading-6 outline-none" plugins={[headingsPlugin(), listsPlugin(), quotePlugin(), linkPlugin(), linkDialogPlugin(), imagePlugin(), tablePlugin(), thematicBreakPlugin(), codeBlockPlugin({ codeBlockEditorDescriptors: [{ priority: -10, match: () => true, Editor: CodeMirrorEditor }] }), codeMirrorPlugin({ codeBlockLanguages: { java: "Java", js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript", tsx: "TypeScript (React)", python: "Python", py: "Python", json: "JSON", html: "HTML", css: "CSS", sql: "SQL", bash: "Bash", sh: "Shell", text: "Plain text" } }), markdownShortcutPlugin()]} />;
}
