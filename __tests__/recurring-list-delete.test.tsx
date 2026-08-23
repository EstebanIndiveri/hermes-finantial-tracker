import { renderToStaticMarkup } from "react-dom/server";
import { RecurringList } from "@/components/recurring/recurring-list";

describe("RecurringList delete flow", () => {
  it("includes confirmation dialog copy and delete action in component source", () => {
    const source = RecurringList.toString();

    expect(source).toContain("¿Eliminar ");
    expect(source).toContain("Esta acción no se puede deshacer");
    expect(source).toContain("method: \"DELETE\"");
    expect(source).toContain("handleDelete");
    expect(source).toContain("handleDeleteClick");
  });

  it("still renders the loading state", () => {
    const markup = renderToStaticMarkup(<RecurringList />);

    expect(markup).toContain("Cargando gastos recurrentes...");
  });
});
