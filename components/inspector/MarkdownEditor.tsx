"use client";

import dynamic from "next/dynamic";

const MarkdownEditorClient = dynamic(() => import("./MarkdownEditorClient").then((module) => module.MarkdownEditorClient), { ssr: false, loading: () => <div className="min-h-44 animate-pulse rounded-md bg-muted/50" /> });

export function MarkdownEditor(props: { markdown: string; onChange: (value: string) => void; darkMode: boolean }) {
  return <MarkdownEditorClient {...props} />;
}
