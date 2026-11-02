import { describe, expect, it } from "vitest";
import { isScrambled, unscramble } from "@/lib/mojibake";

/** Text as a Windows command window scrambles it: its UTF-8 bytes read as code page 437. */
const HIGH = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
const scramble = (s: string) => [...new TextEncoder().encode(s)].map((b) => (b < 0x80 ? String.fromCharCode(b) : HIGH[b - 0x80])).join("");

describe("unscramble", () => {
  it("reads back the Arabic the screens showed scrambled", () => {
    expect(unscramble("╪¼╪»╪⌐")).toBe("جدة");
    expect(scramble("جدة - المكتب الرئيسي")).toBe("╪¼╪»╪⌐ - ╪º┘ä┘à┘â╪¬╪¿ ╪º┘ä╪▒╪ª┘è╪│┘è");
    expect(unscramble("╪¼╪»╪⌐ - ╪º┘ä┘à┘â╪¬╪¿ ╪º┘ä╪▒╪ª┘è╪│┘è")).toBe("جدة - المكتب الرئيسي");
  });

  it("keeps the English around it, and text scrambled twice", () => {
    const name = "Sami Haddad (سامي حداد)";
    expect(unscramble(scramble(name))).toBe(name);
    expect(unscramble(scramble(scramble("فرع الرياض")))).toBe("فرع الرياض");
  });

  it("leaves text that was never scrambled as it is", () => {
    for (const s of ["جدة - المكتب الرئيسي", "José Müller", "25°C ± 2", "Café ½ price", "Ünïcödé", "", "plain"]) {
      expect(unscramble(s)).toBe(s);
      expect(isScrambled(s)).toBe(false);
    }
  });

  it("mends a scrambled stretch beside Arabic typed in since", () => {
    expect(unscramble(`فرع ${scramble("الرياض")}`)).toBe("فرع الرياض");
  });
});
