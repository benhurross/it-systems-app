import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { DisplayMenu } from "@/components/app-shell/display-menu";
import { renderWithProviders } from "./helpers/render";

describe("DisplayMenu", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.fontSize = "";
    document.documentElement.className = "";
  });

  it("steps the text size, remembers it and stops at the largest step", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DisplayMenu />, { theme: true });
    await user.click(screen.getByRole("button", { name: "Display" }));

    const larger = screen.getByRole("button", { name: "Larger text" });
    await user.click(larger);
    expect(document.documentElement.style.fontSize).toBe("112.5%");
    expect(localStorage.getItem("text-size")).toBe("112.5");
    expect(screen.getByText("112.5%")).toBeInTheDocument();

    await user.click(larger);
    await user.click(larger);
    expect(larger).toBeDisabled();
    expect(document.documentElement.style.fontSize).toBe("137.5%");

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(document.documentElement.style.fontSize).toBe("100%");
  });

  it("switches the theme", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DisplayMenu />, { theme: true });
    await user.click(screen.getByRole("button", { name: "Display" }));
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("is labelled in Arabic", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DisplayMenu />, { locale: "ar", theme: true });
    await user.click(screen.getByRole("button", { name: "العرض" }));
    expect(screen.getByRole("button", { name: "تكبير النص" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "داكن" })).toBeInTheDocument();
  });
});
