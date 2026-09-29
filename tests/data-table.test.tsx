import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { columnHelper, DataTable } from "@/components/data-table";
import { renderWithProviders } from "./helpers/render";

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));

type Asset = { tag: string; name: string; status: string };
const col = columnHelper<Asset>();
const columns = [
  col.accessor("tag", { header: "Tag" }),
  col.accessor("name", { header: "Name" }),
  col.accessor("status", { header: "Status", filterFn: "arrHas" }),
];
const assets: Asset[] = Array.from({ length: 25 }, (_, i) => ({
  tag: `AST-${String(i + 1).padStart(4, "0")}`,
  name: i % 2 ? `Laptop ${i + 1}` : `Printer ${i + 1}`,
  status: i % 5 === 0 ? "retired" : "in_use",
}));
const facets = [
  {
    column: "status",
    label: "Status",
    options: [
      { value: "in_use", label: "In use" },
      { value: "retired", label: "Retired" },
    ],
  },
];

const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");

describe("DataTable", () => {
  it("pages through rows and reports the range", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DataTable data={assets} columns={columns} pageSize={10} />);
    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText("1–10 of 25")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("11–20 of 25")).toBeInTheDocument();
  });

  it("filters across columns from the search box", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DataTable data={assets} columns={columns} />);
    await user.type(screen.getByRole("textbox", { name: "Filter rows" }), "printer 1");
    const names = bodyRows().map((row) => within(row).getAllByRole("cell")[1].textContent);
    expect(names).toEqual(["Printer 1", "Printer 11", "Printer 13", "Printer 15", "Printer 17", "Printer 19"]);
  });

  it("filters by a facet and shows how many rows each option holds", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DataTable data={assets} columns={columns} facets={facets} />);
    await user.click(screen.getByRole("button", { name: "Status", expanded: false }));
    const retired = screen.getByRole("menuitemcheckbox", { name: /Retired/ });
    expect(retired).toHaveTextContent("5");
    await user.click(retired);
    await user.keyboard("{Escape}");
    expect(bodyRows()).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("1–20 of 25")).toBeInTheDocument();
  });

  it("sorts when a header is pressed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DataTable data={assets} columns={columns} />);
    await user.click(screen.getByRole("button", { name: /Tag/ }));
    await user.click(screen.getByRole("button", { name: /Tag/ }));
    expect(within(bodyRows()[0]).getAllByRole("cell")[0]).toHaveTextContent("AST-0025");
  });

  it("opens a row's page when the row is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DataTable data={assets} columns={columns} rowHref={(a) => `/assets/${a.tag}`} />);
    await user.click(screen.getByText("Printer 3"));
    expect(push).toHaveBeenCalledWith("/assets/AST-0003");
  });

  it("says when there is nothing to show", () => {
    renderWithProviders(<DataTable data={[]} columns={columns} />);
    expect(screen.getByText("Nothing to show yet")).toBeInTheDocument();
  });

  it("names the export after its report and holds it until the rows arrive", () => {
    const csv = { filename: "audit.csv", label: "Audit report", columns: [{ header: "Tag", value: (a: Asset) => a.tag }] };
    const { rerender } = renderWithProviders(<DataTable data={[]} columns={columns} csv={csv} loading />);
    expect(screen.getByRole("button", { name: "Audit report" })).toBeDisabled();
    rerender(<DataTable data={assets} columns={columns} csv={csv} />);
    expect(screen.getByRole("button", { name: "Audit report" })).toBeEnabled();
  });
});
