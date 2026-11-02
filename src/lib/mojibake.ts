/**
 * Text scrambled on its way through a Windows command window: Arabic (or any UTF-8 text beyond
 * plain English) read byte by byte as the old DOS characters (code page 437) and saved like that,
 * so "جدة" became "╪¼╪»╪⌐". Reading those characters back as their bytes gives the text again.
 */

/** Code page 437's characters for the bytes 0x80 to 0xFF, in order. */
const HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";

const BYTE = new Map([...HIGH].map((c, i) => [c, 0x80 + i]));
const RUN = new RegExp(`[${HIGH.replace(/[\]\\^-]/g, "\\$&")}]{2,}`, "gu");
const utf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * The text with each scrambled stretch read back. A stretch is only changed when its bytes make
 * whole, valid UTF-8 characters, none of them plain English, so "José" or "25°" stay as they are.
 */
export function unscramble(text: string): string {
  let out = text;
  // Text scrambled twice is read back twice.
  for (let pass = 0; pass < 3; pass++) {
    const next = out.replace(RUN, (run) => {
      const bytes = Uint8Array.from([...run], (c) => BYTE.get(c)!);
      let read: string;
      try {
        read = utf8.decode(bytes);
      } catch {
        return run;
      }
      return /^[^\u0000-\u007f]+$/u.test(read) ? read : run;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Whether the text holds a scrambled stretch that reads back. */
export const isScrambled = (text: string) => unscramble(text) !== text;
