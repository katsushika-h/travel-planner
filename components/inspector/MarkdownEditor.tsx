"use client";

import dynamic from "next/dynamic";

const MarkdownEditorClient = dynamic(
  () => import("./MarkdownEditorClient").then((module) => module.MarkdownEditorClient),
  { ssr: false, loading: () => <div className="min-h-20 animate-pulse bg-surface" /> },
);

export function MarkdownEditor(props: { markdown: string; onChange: (value: string) => void; darkMode: boolean }) {
  return <MarkdownEditorClient {...props} />;
}
