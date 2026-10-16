"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { displayCents, distributeEqual, distributePercent, memberKey, parseDecimalCents, type EditMember, type EditSplitType } from "@/lib/splits/edit-allocation";

type InitialRow = { key: string; amount: number };
type ParticipantRow = InitialRow & { percentage: number | null };
type Props = {
  sessionId: string;
  splitId?: string;
  sessionName: string;
  description: string;
  totalAmount: number;
  splitType: EditSplitType;
  members: EditMember[];
  payers: InitialRow[];
  participants: ParticipantRow[];
};

const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid var(--hborder)", background: "var(--hsurface2)", color: "var(--htext1)", fontSize: 14, boxSizing: "border-box" as const };
const money = (value: number) => displayCents(Math.round(value * 100));

export function SplitAllocationForm(props: Props) {
  const router = useRouter();
  const isCreate = !props.splitId;
  const [description, setDescription] = useState(props.description);
  const [totalRaw, setTotalRaw] = useState(money(props.totalAmount));
  const [splitType, setSplitType] = useState<EditSplitType>(props.splitType);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>(() => Object.fromEntries(props.payers.map(row => [row.key, money(row.amount)])));
  const [selected, setSelected] = useState<string[]>(() => props.participants.map(row => row.key));
  const [fixedAmounts, setFixedAmounts] = useState<Record<string, string>>(() => Object.fromEntries(props.participants.map(row => [row.key, money(row.amount)])));
  const [percentages, setPercentages] = useState<Record<string, string>>(() => Object.fromEntries(props.participants.map(row => [row.key, row.percentage == null ? "" : money(row.percentage)])));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const createOperationRef = useRef<string | null>(null);
  const submittedBodyRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calculation = useMemo(() => {
    const total = parseDecimalCents(totalRaw);
    const payerEntries = props.members.map(member => ({ member, cents: parseDecimalCents(payerAmounts[memberKey(member)] ?? "") }))
      .filter(entry => entry.cents != null && entry.cents > 0);
    const paid = payerEntries.reduce((sum, entry) => sum + (entry.cents ?? 0), 0);
    const invalidPayer = Object.values(payerAmounts).some(raw => raw.trim() && parseDecimalCents(raw) === null);
    const chosen = props.members.filter(member => selected.includes(memberKey(member)));
    let owed: number[] = [];
    let basisPoints: number[] = [];
    if (total !== null && total > 0) {
      if (splitType === "equal") owed = distributeEqual(total, chosen.length);
      if (splitType === "fixed") owed = chosen.map(member => parseDecimalCents(fixedAmounts[memberKey(member)] ?? "") ?? 0);
      if (splitType === "percentage") {
        basisPoints = chosen.map(member => parseDecimalCents(percentages[memberKey(member)] ?? "") ?? 0);
        owed = distributePercent(total, basisPoints);
      }
    }
    const allocated = owed.reduce((sum, cents) => sum + cents, 0);
    const valid = total !== null && total > 0 && !invalidPayer && payerEntries.length > 0 &&
      chosen.length > 0 && paid === total && owed.length === chosen.length &&
      owed.every(cents => cents > 0) && allocated === total;
    return { total, payerEntries, paid, chosen, owed, basisPoints, allocated, valid };
  }, [totalRaw, payerAmounts, selected, fixedAmounts, percentages, splitType, props.members]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!calculation.valid || savingRef.current || (isCreate && !description.trim())) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const payload = {
      ...(isCreate ? { description: description.trim() } : {}),
      totalAmount: calculation.total! / 100,
      splitType,
      payers: calculation.payerEntries.map(({ member, cents }) => ({
        ...(member.userId ? { userId: member.userId } : { tempUserId: member.tempUserId }), amountPaid: cents! / 100,
      })),
      participants: calculation.chosen.map((member, index) => ({
        ...(member.userId ? { userId: member.userId } : { tempUserId: member.tempUserId }),
        amount: calculation.owed[index] / 100,
        ...(splitType === "percentage" ? { percentage: calculation.basisPoints[index] / 100 } : {}),
      })),
    };
    const body = JSON.stringify(payload);
    if (isCreate && submittedBodyRef.current !== null && submittedBodyRef.current !== body) {
      setError("Ya se intentó registrar otra versión de este gasto. Volvé a la sesión para comprobar si quedó guardado antes de iniciar uno nuevo.");
      setSaving(false);
      savingRef.current = false;
      return;
    }
    if (isCreate) {
      submittedBodyRef.current = body;
      createOperationRef.current ??= crypto.randomUUID();
    }
    try {
      const response = await fetch(isCreate ? `/api/splits/sessions/${props.sessionId}/items` : `/api/splits/items/${props.splitId}`, {
        method: isCreate ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isCreate ? { ...payload, operationId: createOperationRef.current } : payload),
      });
      if (!response.ok) {
        if (response.status === 409) throw new Error(isCreate
          ? "Esta operación ya se usó para otro gasto. Volvé a la sesión y comprobá qué quedó registrado antes de iniciar uno nuevo."
          : "La sesión cambió o ya registra pagos. Recargá antes de intentar corregir este gasto.");
        if (isCreate && response.status === 400) throw new Error("La sesión cambió o el reparto ya no es válido. Recargá y revisá los miembros.");
        if (isCreate && response.status >= 500) throw new Error("No pudimos confirmar si el gasto quedó guardado. Podés reintentar sin cambiar los datos; usaremos la misma operación para evitar un duplicado.");
        throw new Error(response.status === 403 ? "Ya no tenés permiso para editar esta sesión." : "No se pudo guardar el reparto. Revisá los importes y volvé a intentar.");
      }
      router.push(`/dashboard/compartidos/${props.sessionId}`);
      router.refresh();
    } catch (cause) {
      setError(isCreate && cause instanceof TypeError
        ? "No pudimos confirmar si el gasto quedó guardado. Reintentá sin cambiar los datos o comprobá la sesión antes de iniciar otro."
        : cause instanceof Error ? cause.message : "No se pudo guardar el reparto.");
      setSaving(false);
      savingRef.current = false;
    }
  }

  return <div style={{ maxWidth: 760, margin: "0 auto", color: "var(--htext1)", fontFamily: "DM Sans, sans-serif" }}>
    <Link href={`/dashboard/compartidos/${props.sessionId}`} style={{ color: "var(--htext2)", fontSize: 13, textDecoration: "none" }}>← {props.sessionName}</Link>
    <header style={{ margin: "18px 0 24px" }}>
      <p style={{ margin: "0 0 6px", color: "var(--haccent)", textTransform: "uppercase", letterSpacing: ".08em", fontSize: 11, fontWeight: 700 }}>{isCreate ? "Gasto compartido" : "Corrección de gasto"}</p>
      <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.25 }}>{isCreate ? "Nuevo gasto" : props.description}</h1>
      <p style={{ color: "var(--htext2)", fontSize: 13, lineHeight: 1.5 }}>{isCreate ? "Elegí quién pagó y cómo se reparte entre los miembros de esta sesión." : "Reemplazá el reparto completo. Solo se puede hacer antes del primer pago de la sesión."}</p>
    </header>
    <form onSubmit={save} style={{ display: "grid", gap: 16 }}>
      {isCreate && <section className="h-card" style={{ padding: 20 }}>
        <label htmlFor="split-description" style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Descripción</label>
        <input id="split-description" value={description} onChange={event => setDescription(event.target.value)} required maxLength={200} placeholder="Ej: cena, taxi, supermercado" style={inputStyle} />
      </section>}
      <section className="h-card" style={{ padding: 20 }}>
        <label htmlFor="split-total" style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Total del gasto (ARS)</label>
        <input id="split-total" value={totalRaw} onChange={event => setTotalRaw(event.target.value)} inputMode="decimal" required style={inputStyle} />
        <p style={{ fontSize: 12, color: "var(--htext3)", marginBottom: 0 }}>Usá coma para centavos; por ejemplo 1.234,56.</p>
      </section>
      <section className="h-card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 5px" }}>Quién pagó</h2>
        <p style={{ fontSize: 12, color: "var(--htext2)", margin: "0 0 16px" }}>Dejá vacío a quien no aportó. Los pagos deben sumar el total.</p>
        <div style={{ display: "grid", gap: 12 }}>
          {props.members.map(member => <label key={memberKey(member)} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) minmax(120px, 170px)", gap: 12, alignItems: "center", fontSize: 13 }}>
            <span>{member.label}</span>
            <input aria-label={`Pagó ${member.label} en ARS`} value={payerAmounts[memberKey(member)] ?? ""} onChange={event => setPayerAmounts(current => ({ ...current, [memberKey(member)]: event.target.value }))} placeholder="0" inputMode="decimal" style={inputStyle} />
          </label>)}
        </div>
        <p aria-live="polite" style={{ fontSize: 12, color: calculation.total === calculation.paid ? "#168960" : "#C97817", marginBottom: 0 }}>Pagado: ${displayCents(calculation.paid)} · Diferencia: ${displayCents(Math.abs((calculation.total ?? 0) - calculation.paid))}</p>
      </section>
      <section className="h-card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 5px" }}>Quién debe</h2>
        <p style={{ fontSize: 12, color: "var(--htext2)", margin: "0 0 14px" }}>Seleccioná participantes y cómo dividir el gasto.</p>
        <label htmlFor="split-type" style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Forma de reparto</label>
        <select id="split-type" value={splitType} onChange={event => setSplitType(event.target.value as EditSplitType)} style={{ ...inputStyle, marginBottom: 16 }}>
          <option value="equal">Partes iguales</option><option value="percentage">Porcentajes</option><option value="fixed">Montos fijos</option>
        </select>
        <div style={{ display: "grid", gap: 12 }}>
          {props.members.map(member => {
            const key = memberKey(member);
            const checked = selected.includes(key);
            const index = calculation.chosen.findIndex(value => memberKey(value) === key);
            return <div key={key} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) minmax(100px, 170px)", gap: 12, alignItems: "center", fontSize: 13 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={checked} onChange={event => setSelected(current => event.target.checked ? [...current, key] : current.filter(value => value !== key))} />{member.label}</label>
              {checked && (splitType === "equal" ? <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>${index >= 0 && calculation.owed[index] ? displayCents(calculation.owed[index]) : "—"}</span> :
                <input aria-label={splitType === "percentage" ? `Porcentaje de ${member.label}` : `Debe ${member.label} en ARS`} value={splitType === "percentage" ? percentages[key] ?? "" : fixedAmounts[key] ?? ""} onChange={event => splitType === "percentage" ? setPercentages(current => ({ ...current, [key]: event.target.value })) : setFixedAmounts(current => ({ ...current, [key]: event.target.value }))} placeholder={splitType === "percentage" ? "%" : "0"} inputMode="decimal" style={inputStyle} />)}
            </div>;
          })}
        </div>
        <p aria-live="polite" style={{ fontSize: 12, color: calculation.total === calculation.allocated ? "#168960" : "#C97817", marginBottom: 0 }}>Asignado: ${displayCents(calculation.allocated)} · Diferencia: ${displayCents(Math.abs((calculation.total ?? 0) - calculation.allocated))}{splitType === "percentage" ? ` · Porcentajes: ${displayCents(calculation.basisPoints.reduce((sum, value) => sum + value, 0))}%` : ""}</p>
      </section>
      {error && <p role="alert" style={{ color: "#DC3545", fontSize: 13, margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <Link href={`/dashboard/compartidos/${props.sessionId}`} style={{ padding: "11px 16px", color: "var(--htext2)", textDecoration: "none" }}>Cancelar</Link>
        <button type="submit" disabled={!calculation.valid || saving || (isCreate && !description.trim())} style={{ border: 0, borderRadius: 9, padding: "11px 18px", color: "white", background: "var(--haccent)", fontWeight: 700, opacity: !calculation.valid || saving || (isCreate && !description.trim()) ? .5 : 1, cursor: !calculation.valid || saving || (isCreate && !description.trim()) ? "not-allowed" : "pointer" }}>{saving ? "Guardando…" : isCreate ? "Registrar gasto" : "Guardar reparto"}</button>
      </div>
    </form>
  </div>;
}
