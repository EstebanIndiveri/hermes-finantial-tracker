import { renderToStaticMarkup } from "react-dom/server";
import { SplitAllocationForm } from "@/app/dashboard/compartidos/[id]/SplitAllocationForm";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));

const members = [
  { userId: "owner", label: "Esteban" },
  { tempUserId: "guest", label: "Invitada temporal" },
];

describe("formulario web conservativo de compartidos", () => {
  test("alta muestra miembros reales y no promete un gasto unipersonal por defecto", () => {
    const html = renderToStaticMarkup(<SplitAllocationForm
      sessionId="session" sessionName="Viaje" description="" totalAmount={0}
      splitType="equal" members={members} payers={[]}
      participants={members.map(member => ({ key: member.userId ? "user:owner" : "temp:guest", amount: 0, percentage: null }))}
    />);
    expect(html).toContain("Invitada temporal");
    expect(html).toContain("Quién pagó");
    expect(html).toContain("Quién debe");
    expect(html).toContain("Registrar gasto");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Registrar gasto<\/button>/);
  });

  test("edición existente muestra cuotas y total cerrado", () => {
    const html = renderToStaticMarkup(<SplitAllocationForm
      sessionId="session" splitId="split" sessionName="Viaje" description="Cena"
      totalAmount={101} splitType="equal" members={members}
      payers={[{ key: "user:owner", amount: 101 }]}
      participants={[{ key: "user:owner", amount: 50.5, percentage: null }, { key: "temp:guest", amount: 50.5, percentage: null }]}
    />);
    expect(html).toContain("Cena");
    expect(html).toContain("50,50");
    expect(html).toContain("Diferencia: $0");
    expect(html).toContain("Guardar reparto");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Guardar reparto<\/button>/);
  });
});
