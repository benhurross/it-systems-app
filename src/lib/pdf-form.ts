import {
  PDFBool,
  PDFButton,
  PDFCheckBox,
  type PDFDocument,
  PDFDropdown,
  type PDFField,
  type PDFFont,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFString,
  PDFTextField,
  StandardFonts,
} from "pdf-lib";
import { shownBox } from "./pdf-geometry";
import { loadPdf } from "./pdf-tools";

/**
 * Filling in a PDF form in the browser: the fields a form already has (text, ticks, choices),
 * read so a person can fill them in on the page, then written back and saved. The answers can be
 * locked, so the filled form can no longer be changed.
 *
 * Text in Latin letters is drawn into the form here. Text in other scripts, Arabic above all, is
 * left for the PDF reader to draw (the standard fonts here cannot hold it, nor join its letters),
 * which is why a form with such text cannot be locked.
 */

/** Where a field sits: its page (from 0) and its box, in fractions of the page as shown, from the top left. */
export type FieldSpot = { page: number; x: number; y: number; width: number; height: number };

type Common = { name: string; label: string; readOnly: boolean; required: boolean; spots: FieldSpot[] };
export type FormField =
  | (Common & { kind: "text"; value: string; multiline: boolean; maxLength: number | null })
  | (Common & { kind: "checkbox"; value: boolean })
  | (Common & { kind: "radio"; value: string | null; options: string[] })
  | (Common & { kind: "dropdown"; value: string | null; options: string[]; editable: boolean })
  | (Common & { kind: "list"; value: string[]; options: string[]; multiple: boolean })
  // Shown so the person knows they are there, but not filled here.
  | (Common & { kind: "signature" | "button" });

export type FormValue = string | boolean | string[] | null;
export type FormValues = Record<string, FormValue>;

/** What reading a form found: its fields, or why it cannot be filled here. */
export type ReadForm = { fields: FormField[]; problem: null | "none" | "xfa" };

/** An XFA form (Adobe's own kind, made in LiveCycle Designer) can only be filled in Adobe's programs. */
function hasXfa(pdf: PDFDocument) {
  return Boolean(pdf.catalog.getAcroForm()?.dict.has(PDFName.of("XFA")));
}

/** A field's name for people: the hint its maker gave it, or its own name made readable. */
function labelOf(field: PDFField) {
  const hint = field.acroField.dict.lookup(PDFName.of("TU"));
  const text = hint instanceof PDFString || hint instanceof PDFHexString ? hint.decodeText().trim() : "";
  if (text) return text;
  // "topmostSubform[0].Page1[0].First_name[0]" is "First name".
  const last = (field.getName().split(".").pop() ?? field.getName()).replace(/\[\d+\]$/, "");
  const words = last
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : field.getName();
}

function spotsOf(pdf: PDFDocument, field: PDFField): FieldSpot[] {
  const pages = pdf.getPages();
  return field.acroField.getWidgets().flatMap((widget) => {
    const ref = widget.P();
    let index = ref ? pages.findIndex((p) => p.ref === ref) : -1;
    // A widget that does not say its page is found among the pages' annotations.
    if (index < 0) {
      index = pages.findIndex((p) =>
        p.node
          .Annots()
          ?.asArray()
          .some((a) => pdf.context.lookup(a) === widget.dict),
      );
    }
    if (index < 0) return [];
    return [{ page: index, ...shownBox(pages[index], widget.getRectangle()) }];
  });
}

export async function readForm(bytes: Uint8Array): Promise<ReadForm> {
  const pdf = await loadPdf(bytes);
  if (hasXfa(pdf) && (pdf.catalog.getAcroForm()?.getAllFields().length ?? 0) === 0) return { fields: [], problem: "xfa" };
  const fields = pdf
    .getForm()
    .getFields()
    .flatMap((field): FormField[] => {
      const common: Common = { name: field.getName(), label: labelOf(field), readOnly: field.isReadOnly(), required: field.isRequired(), spots: spotsOf(pdf, field) };
      if (field instanceof PDFTextField) {
        return [{ ...common, kind: "text", value: field.getText() ?? "", multiline: field.isMultiline(), maxLength: field.getMaxLength() ?? null }];
      }
      if (field instanceof PDFCheckBox) return [{ ...common, kind: "checkbox", value: field.isChecked() }];
      if (field instanceof PDFRadioGroup) return [{ ...common, kind: "radio", value: field.getSelected() ?? null, options: field.getOptions() }];
      if (field instanceof PDFDropdown) {
        return [{ ...common, kind: "dropdown", value: field.getSelected()[0] ?? null, options: field.getOptions(), editable: field.isEditable() }];
      }
      if (field instanceof PDFOptionList) return [{ ...common, kind: "list", value: field.getSelected(), options: field.getOptions(), multiple: field.isMultiselect() }];
      if (field instanceof PDFSignature) return [{ ...common, kind: "signature" }];
      if (field instanceof PDFButton) return [{ ...common, kind: "button" }];
      return [];
    });
  // In the order they come on the pages: by page, then down the page, then across.
  const at = (f: FormField) => f.spots[0] ?? { page: Number.MAX_SAFE_INTEGER, x: 0, y: 0 };
  fields.sort((a, b) => at(a).page - at(b).page || Math.round((at(a).y - at(b).y) * 200) || at(a).x - at(b).x);
  return { fields, problem: fields.length === 0 ? "none" : null };
}

/** Whether the standard font can write the text, so it can be drawn into the form here. */
function writable(font: PDFFont, text: string) {
  try {
    // Line breaks are not drawn as letters: a field with several lines is drawn line by line.
    font.encodeText(text.replace(/[\r\n\t]/g, ""));
    return true;
  } catch {
    return false;
  }
}

/** Raised when locking is asked for but some answers are in a script only the PDF reader can draw. */
export class FormLockError extends Error {
  constructor() {
    super("lockNeedsLatin");
  }
}

/**
 * The form with the given answers. Fields not named, and read-only ones, are left as they were.
 * Locking flattens the answers into the pages, so they show but can no longer be changed.
 */
export async function fillForm(bytes: Uint8Array, values: FormValues, { lock = false }: { lock?: boolean } = {}): Promise<Uint8Array> {
  const pdf = await loadPdf(bytes);
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let readerDraws = false;

  for (const field of form.getFields()) {
    const name = field.getName();
    if (!(name in values) || field.isReadOnly()) continue;
    const value = values[name];
    if (field instanceof PDFTextField) {
      const text = typeof value === "string" ? value : "";
      const max = field.getMaxLength();
      field.setText(text ? (max ? text.slice(0, max) : text) : undefined);
      if (writable(font, text)) field.updateAppearances(font);
      else readerDraws = true;
    } else if (field instanceof PDFCheckBox) {
      if (value === true) field.check();
      else field.uncheck();
    } else if (field instanceof PDFRadioGroup) {
      if (typeof value === "string" && field.getOptions().includes(value)) field.select(value);
      else field.clear();
    } else if (field instanceof PDFDropdown) {
      if (typeof value === "string" && value && (field.isEditable() || field.getOptions().includes(value))) field.select(value);
      else field.clear();
      if (writable(font, typeof value === "string" ? value : "")) field.updateAppearances(font);
      else readerDraws = true;
    } else if (field instanceof PDFOptionList) {
      const chosen = (Array.isArray(value) ? value : typeof value === "string" ? [value] : []).filter((v) => field.getOptions().includes(v));
      if (chosen.length > 0) field.select(field.isMultiselect() ? chosen : chosen.slice(0, 1));
      else field.clear();
      if (chosen.every((v) => writable(font, v))) field.updateAppearances(font);
      else readerDraws = true;
    }
  }

  if (lock) {
    if (readerDraws) throw new FormLockError();
    // Fields the form left without a look of their own get one, then all are drawn into the pages.
    try {
      form.flatten();
    } catch (error) {
      throw /encode/i.test(String(error)) ? new FormLockError() : error;
    }
  } else if (readerDraws) {
    // The reader draws the answers it is given in its own fonts, with letters joined and right to left.
    pdf.catalog.getOrCreateAcroForm().dict.set(PDFName.of("NeedAppearances"), PDFBool.True);
  }
  return pdf.save({ updateFieldAppearances: false });
}
