import { strFromU8, unzipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { buildDocx, type WordParagraph, xmlText } from "@/lib/docx";
import { familyOf, keptPictures, layoutPages, type PageContent, pagesToDocx, readPdf, scannedPages, type TextBit } from "@/lib/pdf-to-word";

const font = (bold = false) => ({ name: "Arial", bold, italic: false });
/** Text as a PDF places it: x from the left, y its baseline from the top. */
const bit = (text: string, x: number, y: number, size = 11, bold = false): TextBit => ({ text, x, y, width: text.length * size * 0.5, size, font: font(bold) });
const A4 = { width: 595, height: 842 };
const page = (texts: TextBit[], size = A4): PageContent => ({ ...size, texts, pictures: [] });
const paragraphsOf = (pages: PageContent[], pageBreaks = true) => layoutPages(pages, { pageBreaks }).flatMap((s) => s.blocks) as WordParagraph[];
const textOf = (p: WordParagraph) => p.runs.map((r) => r.text).join("");

describe("the Word file", () => {
  it("holds the parts Word needs, with the text, styles and pictures", () => {
    const picture = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const docx = buildDocx({
      title: "Report & notes",
      sections: [
        {
          ...A4,
          margin: 72,
          blocks: [
            { kind: "paragraph", heading: 1, runs: [{ text: "Title", size: 22, bold: true }] },
            { kind: "paragraph", runs: [{ text: "Name\tAmount", size: 11 }], tabs: [200] },
            { kind: "paragraph", rtl: true, runs: [{ text: "مرحبا", size: 11, rtl: true }] },
            { kind: "picture", bytes: picture, type: "image/png", width: 100, height: 50, pageBreakBefore: true },
          ],
        },
      ],
    });
    const files = unzipSync(docx);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels", "word/media/image1.png"]),
    );
    const xml = strFromU8(files["word/document.xml"]);
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).toContain('<w:t xml:space="preserve">Name</w:t><w:tab/><w:t xml:space="preserve">Amount</w:t>');
    expect(xml).toContain('<w:tab w:val="left" w:pos="4000"/>');
    expect(xml).toContain("<w:bidi/>");
    expect(xml).toContain("<w:rtl/>");
    expect(xml).toContain('<a:blip r:embed="rIdImage1"/>');
    expect(xml).toContain('<wp:extent cx="1270000" cy="635000"/>');
    expect(xml).toContain('<w:pgSz w:w="11900" w:h="16840"/>');
    expect(strFromU8(files["docProps/core.xml"])).toContain("<dc:title>Report &amp; notes</dc:title>");
    expect(files["word/media/image1.png"]).toEqual(picture);
  });

  it("escapes text, and drops characters XML cannot hold", () => {
    expect(xmlText('a < b & "c" > d')).toBe("a &lt; b &amp; &quot;c&quot; &gt; d");
    expect(xmlText("bell\u0007 and \uD800 lone")).toBe("bell and  lone");
  });
});

describe("font names", () => {
  it("are read as Word knows them", () => {
    expect(familyOf("ABCDEF+TimesNewRomanPS-BoldMT", "serif")).toBe("Times New Roman");
    expect(familyOf("ArialMT", "sans-serif")).toBe("Arial");
    expect(familyOf("Helvetica-Bold", "sans-serif")).toBe("Arial");
    expect(familyOf("QWERTY+DejaVuSans", "sans-serif")).toBe("DejaVu Sans");
    expect(familyOf("Calibri,Bold", "sans-serif")).toBe("Calibri");
    expect(familyOf("", "serif")).toBe("Times New Roman");
  });
});

describe("rebuilding the layout", () => {
  it("joins wrapped lines into a justified paragraph, and finds headings", () => {
    const [heading, body] = paragraphsOf([
      page([
        bit("Annual review", 72, 90, 22, true),
        { ...bit("The first line of a paragraph runs all the way across the page width.", 72, 130), width: 451 },
        { ...bit("The second line, also justified, runs all the way across the page.", 72, 144), width: 451 },
        bit("Last line.", 72, 158),
      ]),
    ]);
    // Lines that reach the right edge are wrapped text; the last one ends the paragraph.
    expect(heading.heading).toBe(1);
    expect(textOf(heading)).toBe("Annual review");
    expect(textOf(body)).toBe("The first line of a paragraph runs all the way across the page width. The second line, also justified, runs all the way across the page. Last line.");
    expect(body.align).toBe("both");
    expect(heading.runs[0].bold).toBe(true);
  });

  it("centres what is centred, and keeps paragraphs apart where lines stop short", () => {
    const text = "Centred subtitle";
    const width = text.length * 5.5;
    const [centred, first, second] = paragraphsOf([
      page([bit(text, (595 - width) / 2, 100), bit("A short line.", 72, 140), bit("Another short one.", 72, 154)]),
    ]);
    expect(centred.align).toBe("center");
    expect(textOf(first)).toBe("A short line.");
    expect(textOf(second)).toBe("Another short one.");
  });

  it("turns columns into tab stops, even where they are close together", () => {
    const rows = [
      ["Type", "Requests", "Time"],
      ["Email", "142", "4 hours"],
      ["Printers", "96", "7 hours"],
    ];
    const blocks = paragraphsOf([page(rows.flatMap((row, r) => row.map((cell, c) => bit(cell, 72 + c * 50, 200 + r * 16))))]);
    expect(blocks.map(textOf)).toEqual(["Type\tRequests\tTime", "Email\t142\t4 hours", "Printers\t96\t7 hours"]);
    expect(blocks[0].tabs).toEqual([50, 100]);
  });

  it("never finds columns in ordinary text, even written a word at a time", () => {
    const words = "the service desk handled most requests about email printers and access to shared folders while the new portal now takes half of them every week".split(" ");
    // Ten lines of words with ordinary spaces, each line starting at the margin.
    const texts = Array.from({ length: 10 }, (_, l) =>
      words.slice(l % 7, (l % 7) + 9).reduce<TextBit[]>((line, word) => {
        const last = line.at(-1);
        return [...line, bit(word, last ? last.x + last.width + 3 : 72, 100 + l * 14)];
      }, []),
    ).flat();
    expect(paragraphsOf([page(texts)]).every((p) => !p.tabs && !textOf(p).includes("\t"))).toBe(true);
  });

  it("reads Arabic lines right to left", () => {
    const [p] = paragraphsOf([page([{ ...bit("مرحبا", 400, 100), width: 40 }, { ...bit("بكم", 367, 100), width: 30 }])]);
    expect(p.rtl).toBe(true);
    expect(textOf(p)).toBe("مرحبا بكم");
    expect(p.runs[0].rtl).toBe(true);
  });

  it("starts each page on a new page, and a new section when the size changes", () => {
    const sections = layoutPages(
      [page([bit("One", 72, 100)]), page([bit("Two", 72, 100)]), page([bit("Three", 72, 100)], { width: 842, height: 595 })],
      { pageBreaks: true },
    );
    expect(sections.map((s) => [s.width, s.blocks.length])).toEqual([
      [595, 2],
      [842, 1],
    ]);
    expect(sections[0].blocks[1].pageBreakBefore).toBe(true);
    // The new section starts its own page.
    expect(sections[1].blocks[0].pageBreakBefore).toBeUndefined();
    expect(paragraphsOf([page([bit("One", 72, 100)]), page([bit("Two", 72, 100)])], false)[1].pageBreakBefore).toBeUndefined();
  });

  it("puts pictures where they stood, no wider than the text", () => {
    const pic = { x: 72, y: 150, width: 900, height: 300, bytes: new Uint8Array([1]), type: "image/png" as const };
    const blocks = layoutPages([{ ...A4, texts: [bit("Above", 72, 100), bit("Below", 72, 500)], pictures: [pic] }], { pageBreaks: true })[0].blocks;
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "picture", "paragraph"]);
    const picture = blocks[1];
    expect(picture.kind === "picture" && [Math.round(picture.width), Math.round(picture.height)]).toEqual([451, 150]);
  });
});

describe("pictures worth keeping", () => {
  it("drops tiny ones and backgrounds behind text, keeps scans, and joins overlapping ones", () => {
    const texts = Array.from({ length: 30 }, (_, i) => bit("word", 100 + (i % 5) * 40, 100 + i * 10));
    expect(keptPictures([{ x: 10, y: 10, width: 8, height: 8 }], [], A4)).toEqual([]);
    expect(keptPictures([{ x: 0, y: 0, width: 595, height: 842 }], texts, A4)).toEqual([]);
    expect(keptPictures([{ x: 0, y: 0, width: 595, height: 842 }], [], A4)).toHaveLength(1);
    expect(
      keptPictures(
        [
          { x: 300, y: 500, width: 100, height: 50 },
          { x: 300, y: 540, width: 100, height: 50 },
        ],
        texts,
        A4,
      ),
    ).toEqual([{ x: 300, y: 500, width: 100, height: 90 }]);
  });

  it("names pages with no text as scans", () => {
    expect(scannedPages([page([]), page([bit("Text", 72, 100)])])).toEqual([1]);
  });
});

describe("a PDF to Word", () => {
  it("keeps the words, the headings and bold text", async () => {
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const p1 = pdf.addPage([595, 842]);
    p1.drawText("Network policy", { x: 72, y: 760, size: 24, font: bold });
    p1.drawText("Every device on the network is registered with IT.", { x: 72, y: 720, size: 11, font: regular });
    pdf.addPage([595, 842]).drawText("Second page", { x: 72, y: 760, size: 11, font: regular });

    const doc = await pdfjs.getDocument({ data: await pdf.save(), standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/", verbosity: 0 }).promise;
    const pages = await readPdf(doc, pdfjs as never);
    expect(pages.map((p) => p.texts.map((t) => t.text))).toEqual([["Network policy", "Every device on the network is registered with IT."], ["Second page"]]);
    expect(pages[0].texts[0].font).toEqual({ name: "Arial", bold: true, italic: false });

    const xml = strFromU8(unzipSync(pagesToDocx(pages, "policy", { pageBreaks: true }))["word/document.xml"]);
    expect(xml).toMatch(/<w:pStyle w:val="Heading1"\/>.*Network policy/);
    expect(xml).toContain("Every device on the network is registered with IT.");
    expect(xml).toMatch(/<w:pageBreakBefore\/>.*Second page/);
  });
});
