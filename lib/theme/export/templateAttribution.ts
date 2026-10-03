/** Client-supplied analytics only. Never use these values for authorization or billing. */
export function normalizeTemplateAttribution(bundle: unknown, variant: unknown) {
  const uuid = (value: unknown) => typeof value === "string" && value.length === 36
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : null;
  const systemTemplateBundleId = uuid(bundle);
  return { systemTemplateBundleId, systemTemplateVariantId: systemTemplateBundleId ? uuid(variant) : null };
}

export function readTemplateAttribution(form: FormData) {
  return normalizeTemplateAttribution(form.get("systemTemplateBundleId"), form.get("systemTemplateVariantId"));
}
