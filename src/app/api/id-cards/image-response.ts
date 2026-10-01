/**
 * A stored image as a response. Only PNG and JPEG are ever stored, judged by their content; the
 * browser is told not to guess another type.
 */
export function imageResponse(image: { bytes: Uint8Array; type: string }, cache: string) {
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.type,
      "Content-Length": String(image.bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": cache,
    },
  });
}
