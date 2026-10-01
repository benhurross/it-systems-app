import { describe, expect, it } from "vitest";
import { activeHref, homeFor, navFor } from "@/lib/nav";
import { can } from "@/lib/permissions";

describe("can", () => {
  it.each([
    ["admin", "settings", true],
    ["admin", "it", true],
    ["admin", "request", true],
    ["it_staff", "settings", false],
    ["it_staff", "it", true],
    ["it_staff", "request", true],
    ["employee", "settings", false],
    ["employee", "it", false],
    ["employee", "request", true],
  ] as const)("%s reaching %s is %s", (role, area, expected) => {
    expect(can(role, area)).toBe(expected);
  });

  it("denies unknown or missing roles everything", () => {
    expect(can("user", "request")).toBe(false);
    expect(can(undefined, "request")).toBe(false);
    expect(can(null, "it")).toBe(false);
  });
});

describe("navigation", () => {
  const keys = (role: string) => navFor(role).flatMap((g) => g.items.map((i) => i.key));

  it("gives admins every IT module and Settings, without the self-service group", () => {
    expect(keys("admin")).toContain("settings");
    expect(keys("admin")).toContain("tickets");
    expect(keys("admin")).not.toContain("myRequests");
  });

  it("hides Settings from IT staff", () => {
    expect(keys("it_staff")).toContain("network");
    expect(keys("it_staff")).not.toContain("settings");
  });

  it("gives employees only self service and the tools", () => {
    expect(keys("employee")).toEqual(["home", "myRequests", "newRequest", "knowledge", "tools"]);
  });

  it("gives everyone the tools", () => {
    for (const role of ["admin", "it_staff", "employee"]) expect(keys(role)).toContain("tools");
  });

  it("sends each role to its own start page", () => {
    expect(homeFor("admin")).toBe("/");
    expect(homeFor("it_staff")).toBe("/");
    expect(homeFor("employee")).toBe("/home");
  });

  it("marks the longest matching entry active", () => {
    const employee = navFor("employee");
    expect(activeHref(employee, "/requests/new")).toBe("/requests/new");
    expect(activeHref(employee, "/requests/42")).toBe("/requests");
    expect(activeHref(employee, "/tools/pdf-merge")).toBe("/tools");
    const admin = navFor("admin");
    expect(activeHref(admin, "/")).toBe("/");
    expect(activeHref(admin, "/tickets/12")).toBe("/tickets");
    expect(activeHref(admin, "/settings/users")).toBe("/settings");
  });
});
