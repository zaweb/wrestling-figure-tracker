// Shrinks a chosen photo before it is sent. The server stores the JPEG this returns.

export const MAX_PHOTOS = 8
export const MAX_EDGE = 1568

export async function preparePhoto(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(`Couldn't read ${file.name}. Use a JPEG or PNG (iPhone HEIC photos may need exporting).`)
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return {
    id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
    dataUrl: canvas.toDataURL('image/jpeg', 0.85),
  }
}
