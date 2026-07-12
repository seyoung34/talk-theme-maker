import { Suspense } from "react";
import TemplateEditorClient from "@/components/template/TemplateEditorClient";

export default function EditPage() {
  return <Suspense fallback={null}><TemplateEditorClient /></Suspense>;
}
