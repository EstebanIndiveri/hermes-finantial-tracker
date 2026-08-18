import { renderToStaticMarkup } from "react-dom/server";
import ReimbursementsPage from "@/app/dashboard/reimbursements/page";
import { ReimbursementsList } from "@/components/reimbursements/reimbursements-list";
import { HermesSidebar } from "@/components/dashboard/HermesSidebar";

describe("ReimbursementsList", () => {
  it("renders the loading state copy", () => {
    const markup = renderToStaticMarkup(<ReimbursementsList />);

    expect(markup).toContain("Cargando reintegros...");
  });
});

describe("reimbursements page integration", () => {
  it("renders the reimbursements list from the page", () => {
    const markup = renderToStaticMarkup(<ReimbursementsPage />);

    expect(markup).toContain("Reintegros");
    expect(markup).toContain("Cargando reintegros...");
  });
});

describe("dashboard sidebar integration", () => {
  it("includes a reimbursements navigation link", () => {
    const markup = renderToStaticMarkup(<HermesSidebar />);

    expect(markup).toContain('href="/dashboard/reimbursements"');
    expect(markup).toContain("Reintegros");
  });
});
