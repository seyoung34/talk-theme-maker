import { describe, expect, it } from "vitest";
import { getDefaultSlotCandidateId, getMissingRemoteUploadSlotIds, keepCurrentRemoteUploads, mergeSlotUploads } from "@/components/project/projectImporterHelpers";
import { getInitialSlotCandidateSelections, type SlotUploads } from "@/components/project/projectModel";
import type { RemoteSlotUploads } from "@/lib/theme/systemTemplates";
import { getThemeSlots, getThemeTemplate } from "@/lib/theme/templates";

const entry = (id: string) => ({ id, file: new File([id], `${id}.png`), source: "template" as const });
const remoteEntry = (id: string) => ({ id, fileName: `${id}.png`, mimeType: "image/png", size: 1, storagePath: `${id}.png` });

describe("projectImporterHelpers", () => {
  it("finds only remote slots whose uploads are missing, respecting a requested subset", () => {
    const refs = { hydrated: [remoteEntry("a")], missing: [remoteEntry("b")], empty: [] } as RemoteSlotUploads;
    const uploads = { hydrated: [entry("a")] } as SlotUploads;

    expect(getMissingRemoteUploadSlotIds(refs, uploads)).toEqual(["missing"]);
    expect(getMissingRemoteUploadSlotIds(refs, uploads, ["hydrated", "empty"])).toEqual([]);
    expect(getMissingRemoteUploadSlotIds(refs, uploads, ["missing"])).toEqual(["missing"]);
  });

  it("keeps hydrated entries that still have a remote reference", () => {
    const uploads = { slot: [entry("keep"), entry("removed")], localOnly: [entry("local")] } as SlotUploads;
    const refs = { slot: [remoteEntry("keep")] } as RemoteSlotUploads;

    expect(keepCurrentRemoteUploads(uploads, refs)).toEqual({ slot: [uploads.slot![0]] });
  });

  it("merges uploads without duplicating existing IDs", () => {
    const current = { slot: [entry("first")], untouched: [entry("other")] } as SlotUploads;
    const incoming = { slot: [entry("first"), entry("second")], empty: [] } as SlotUploads;

    const result = mergeSlotUploads(current, incoming);
    expect(result.slot?.map((item) => item.id)).toEqual(["first", "second"]);
    expect(result.untouched).toBe(current.untouched);
    expect(result.empty).toBeUndefined();
  });

  it("uses the established initial selection for a single slot", () => {
    const template = getThemeTemplate("basic");
    const slot = getThemeSlots("android")[0];

    expect(getDefaultSlotCandidateId(slot, "basic", template)).toBe(getInitialSlotCandidateSelections([slot], "basic", template)[slot.id]);
  });
});
