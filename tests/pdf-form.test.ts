import { degrees, PDFDocument, PDFHexString, PDFName, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { FormLockError, fillForm, readForm } from "@/lib/pdf-form";
import { PdfToolError } from "@/lib/pdf-tools";

/** An equipment request form: two pages, every kind of field, in a made-up company's words. */
async function requestForm({ turned = false } = {}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const one = pdf.addPage([600, 800]);
  const two = pdf.addPage([600, 800]);
  if (turned) two.setRotation(degrees(90));
  one.drawText("Equipment request", { x: 50, y: 750, size: 18, font });
  const form = pdf.getForm();

  const name = form.createTextField("topmostSubform[0].Page1[0].employee_name[0]");
  name.addToPage(one, { x: 50, y: 680, width: 300, height: 24 });
  name.enableRequired();
  const reason = form.createTextField("reason");
  reason.enableMultiline();
  reason.addToPage(one, { x: 50, y: 520, width: 500, height: 100 });
  reason.acroField.dict.set(PDFName.of("TU"), PDFHexString.fromText("Why it is needed"));
  const code = form.createTextField("costCentre");
  code.setMaxLength(4);
  code.addToPage(one, { x: 400, y: 680, width: 150, height: 24 });
  const urgent = form.createCheckBox("urgent");
  urgent.addToPage(one, { x: 50, y: 480, width: 16, height: 16 });
  const kind = form.createRadioGroup("deviceType");
  kind.addOptionToPage("Laptop", one, { x: 50, y: 440, width: 16, height: 16 });
  kind.addOptionToPage("Desktop", one, { x: 150, y: 440, width: 16, height: 16 });
  const office = form.createDropdown("office");
  office.addOptions(["Jeddah", "Riyadh", "Dammam"]);
  office.addToPage(one, { x: 50, y: 400, width: 200, height: 24 });
  const extras = form.createOptionList("extras");
  extras.addOptions(["Mouse", "Headset", "Dock"]);
  extras.enableMultiselect();
  extras.addToPage(two, { x: 50, y: 600, width: 200, height: 80 });
  const issued = form.createTextField("issuedBy");
  issued.setText("IT desk");
  issued.enableReadOnly();
  issued.addToPage(two, { x: 50, y: 500, width: 200, height: 24 });
  return pdf.save();
}

describe("reading a form", () => {
  it("finds every field, in the order they come on the pages, with names people can read", async () => {
    const { fields, problem } = await readForm(await requestForm());
    expect(problem).toBeNull();
    expect(fields.map((f) => [f.kind, f.label])).toEqual([
      ["text", "Employee name"],
      ["text", "Cost Centre"],
      ["text", "Why it is needed"],
      ["checkbox", "Urgent"],
      ["radio", "Device Type"],
      ["dropdown", "Office"],
      ["list", "Extras"],
      ["text", "Issued By"],
    ]);
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName["topmostSubform[0].Page1[0].employee_name[0]"]).toMatchObject({ required: true, value: "", multiline: false });
    expect(byName.costCentre).toMatchObject({ maxLength: 4 });
    expect(byName.reason).toMatchObject({ multiline: true });
    expect(byName.deviceType).toMatchObject({ options: ["Laptop", "Desktop"], value: null });
    expect(byName.office).toMatchObject({ options: ["Jeddah", "Riyadh", "Dammam"], editable: false });
    expect(byName.extras).toMatchObject({ multiple: true, value: [] });
    expect(byName.issuedBy).toMatchObject({ readOnly: true, value: "IT desk" });
  });

  it("knows where each field is, as the page is shown", async () => {
    const { fields } = await readForm(await requestForm({ turned: true }));
    const name = fields.find((f) => f.name.endsWith("employee_name[0]"))!;
    expect(name.spots).toHaveLength(1);
    expect(name.spots[0].page).toBe(0);
    expect(name.spots[0].x).toBeCloseTo(50 / 600);
    expect(name.spots[0].y).toBeCloseTo(1 - 704 / 800);
    expect(name.spots[0].width).toBeCloseTo(300 / 600);
    // On a page shown turned, the box turns with it: 200 wide in the page is 200 tall as shown.
    const extras = fields.find((f) => f.name === "extras")!;
    expect(extras.spots[0]).toMatchObject({ page: 1 });
    expect(extras.spots[0].height).toBeCloseTo(200 / 600);
    expect(extras.spots[0].width).toBeCloseTo(80 / 800);
    expect(fields.find((f) => f.kind === "radio")!.spots).toHaveLength(2);
  });

  it("says when a PDF has no fields, or is a form only Adobe's programs can fill", async () => {
    const plain = await PDFDocument.create();
    plain.addPage();
    expect(await readForm(await plain.save())).toEqual({ fields: [], problem: "none" });

    const xfa = await PDFDocument.create();
    xfa.addPage();
    const acroForm = xfa.context.obj({ Fields: [], XFA: xfa.context.obj([]) });
    xfa.catalog.set(PDFName.of("AcroForm"), xfa.context.register(acroForm));
    expect(await readForm(await xfa.save())).toEqual({ fields: [], problem: "xfa" });

    await expect(readForm(new TextEncoder().encode("not a pdf"))).rejects.toEqual(new PdfToolError("notPdf"));
  });
});

describe("filling a form", () => {
  it("writes the answers, leaving read-only fields as they were", async () => {
    const filled = await fillForm(await requestForm(), {
      "topmostSubform[0].Page1[0].employee_name[0]": "Sara Ahmed",
      costCentre: "IT-0042",
      reason: "The old laptop no longer charges.\nIt is five years old.",
      urgent: true,
      deviceType: "Laptop",
      office: "Riyadh",
      extras: ["Mouse", "Dock"],
      issuedBy: "Someone else",
    });
    const form = (await PDFDocument.load(filled)).getForm();
    expect(form.getTextField("topmostSubform[0].Page1[0].employee_name[0]").getText()).toBe("Sara Ahmed");
    // Cut to the field's longest.
    expect(form.getTextField("costCentre").getText()).toBe("IT-0");
    expect(form.getTextField("reason").getText()).toContain("five years old");
    expect(form.getCheckBox("urgent").isChecked()).toBe(true);
    expect(form.getRadioGroup("deviceType").getSelected()).toBe("Laptop");
    expect(form.getDropdown("office").getSelected()).toEqual(["Riyadh"]);
    expect(form.getOptionList("extras").getSelected()).toEqual(["Mouse", "Dock"]);
    expect(form.getTextField("issuedBy").getText()).toBe("IT desk");

    const again = await readForm(filled);
    expect(again.fields.find((f) => f.name === "urgent")).toMatchObject({ value: true });
  });

  it("clears what is emptied, and ignores choices the form does not offer", async () => {
    const first = await fillForm(await requestForm(), { urgent: true, deviceType: "Desktop", office: "Jeddah" });
    const second = await fillForm(first, { urgent: false, deviceType: "Tablet", office: null });
    const form = (await PDFDocument.load(second)).getForm();
    expect(form.getCheckBox("urgent").isChecked()).toBe(false);
    expect(form.getRadioGroup("deviceType").getSelected()).toBeUndefined();
    expect(form.getDropdown("office").getSelected()).toEqual([]);
  });

  it("locks the answers into the pages when asked, lines and all", async () => {
    const answers = { "topmostSubform[0].Page1[0].employee_name[0]": "Sara Ahmed", reason: "First line.\nSecond line.", urgent: true };
    const locked = await fillForm(await requestForm(), answers, { lock: true });
    const pdf = await PDFDocument.load(locked);
    expect(pdf.getForm().getFields()).toHaveLength(0);
    expect(pdf.getPageCount()).toBe(2);
  });

  it("leaves Arabic answers for the PDF reader to draw, and will not lock them", async () => {
    const values = { "topmostSubform[0].Page1[0].employee_name[0]": "سارة أحمد" };
    const filled = await fillForm(await requestForm(), values);
    const pdf = await PDFDocument.load(filled);
    expect(pdf.getForm().getTextField("topmostSubform[0].Page1[0].employee_name[0]").getText()).toBe("سارة أحمد");
    expect(pdf.catalog.getAcroForm()!.dict.get(PDFName.of("NeedAppearances"))?.toString()).toBe("true");
    await expect(fillForm(await requestForm(), values, { lock: true })).rejects.toBeInstanceOf(FormLockError);
  });
});
