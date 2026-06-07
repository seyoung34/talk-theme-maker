import type { ThemeProjectSummary } from "@/lib/theme/types";

export function ThemePreviewShell({ project }: { project?: ThemeProjectSummary }) {
  return (
    <section aria-label="theme preview shell">
      {project ? `${project.rootName} (${project.platform})` : "Theme preview scaffold"}
    </section>
  );
}
