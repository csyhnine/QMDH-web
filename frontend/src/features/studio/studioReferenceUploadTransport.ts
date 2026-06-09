import { validateReferenceImageSize } from "../../utils/uploads";
import { fileToDataUrl } from "./studioAssetUtils";
import type { ReferenceUploadItem } from "./studioTypes";

export type UploadReferenceImage = (payload: {
  file_name: string;
  data_url: string;
}) => Promise<{ storage_path: string }>;

function releaseUploadedReferencePreviews(items: ReferenceUploadItem[]) {
  for (const item of items) {
    if (item.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
}

export async function uploadReferenceFiles(
  files: File[],
  uploadReferenceImage: UploadReferenceImage
): Promise<ReferenceUploadItem[]> {
  const uploadedItems: ReferenceUploadItem[] = [];

  try {
    for (const file of files) {
      const sizeError = validateReferenceImageSize(file);
      if (sizeError) {
        throw new Error(`${file.name}: ${sizeError}`);
      }

      const dataUrl = await fileToDataUrl(file);
      const uploaded = await uploadReferenceImage({
        file_name: file.name,
        data_url: dataUrl,
      });
      uploadedItems.push({
        fileName: file.name,
        previewUrl: URL.createObjectURL(file),
        storagePath: uploaded.storage_path,
      });
    }
  } catch (error) {
    releaseUploadedReferencePreviews(uploadedItems);
    throw error;
  }

  return uploadedItems;
}
