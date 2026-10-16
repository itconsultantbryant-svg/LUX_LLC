export type InvoiceItem = { description: string; quantity: number; unitMinor: string };
export type Invoice = {
  reference: string;
  issueDate: string;
  currency: string;
  category: string;
  items: InvoiceItem[];
  requiresDocuments: boolean;
  confirmationKind: string;
};
export type Provider = {
  id: string;
  organization_id: string;
  legal_name: string;
  license_number: string;
  status: string;
  address: { line?: string; phone?: string };
  valid_until?: string;
};
export function providerFromQr(value: string, origin: string): string {
  const url = new URL(value, origin);
  const id = url.searchParams.get('provider');
  if (
    url.origin !== origin ||
    url.pathname !== '/pay' ||
    !id ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
  )
    throw new Error(
      'This is not a provider code for this HealthWallet app. Select a verified provider from the directory instead.',
    );
  return id;
}
export async function prepareDocument(
  file: File,
): Promise<{ contentType: string; base64: string; preview: string | null }> {
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type))
    throw new Error('Choose a JPEG, PNG or PDF document.');
  let blob: Blob = file;
  if (file.type.startsWith('image/') && file.size > 512 * 1024) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw Error('Image preparation is unavailable. Choose a smaller file.');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error('Could not prepare photo.'))),
          'image/jpeg',
          quality,
        ),
      );
      if (blob.size <= 512 * 1024) break;
    }
  }
  if (blob.size > 512 * 1024)
    throw new Error(
      'Choose a document smaller than 512 KiB, or photograph one readable page at a time.',
    );
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error('Could not read this document.'));
    reader.readAsDataURL(blob);
  });
  return {
    contentType: blob.type,
    base64: data.split(',')[1],
    preview: blob.type.startsWith('image/') ? data : null,
  };
}
