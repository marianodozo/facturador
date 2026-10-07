/**
 * Verifica el avance de `proximaFacturacion` después de facturar un período.
 *
 * Es la lógica que evitaba que un servicio ya facturado volviera a aparecer
 * como borrador en la corrida siguiente: la fecha tiene que quedar *después*
 * del fin del período facturado, no un solo paso adelante.
 */
import { finDePeriodo, proximaTrasPeriodo } from "../src/lib/ajustes";

let fallos = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fallos++;
    console.log("FALLA:", m);
  } else console.log("ok  :", m);
};

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "null");

// --- fin de período ---------------------------------------------------------
ok(iso(finDePeriodo("2026-10")) === "2026-10-31", `fin de 2026-10 (${iso(finDePeriodo("2026-10"))})`);
ok(iso(finDePeriodo("2026-02")) === "2026-02-28", `fin de 2026-02 (${iso(finDePeriodo("2026-02"))})`);
ok(iso(finDePeriodo("2028-02")) === "2028-02-29", `fin de febrero bisiesto (${iso(finDePeriodo("2028-02"))})`);
ok(iso(finDePeriodo("2026-12")) === "2026-12-31", `fin de diciembre (${iso(finDePeriodo("2026-12"))})`);

// --- caso normal: al día ----------------------------------------------------
const fin = finDePeriodo("2026-10");

const mensual = proximaTrasPeriodo(new Date(2026, 9, 10), "MENSUAL", fin, 10);
ok(iso(mensual) === "2026-11-10", `mensual al día avanza un mes (${iso(mensual)})`);

// --- el bug: un servicio atrasado -------------------------------------------
// Vencía en julio y se factura el período de octubre. Un solo paso lo dejaría
// en agosto, otra vez vencido, y la corrida de noviembre lo volvería a tomar.
const atrasado = proximaTrasPeriodo(new Date(2026, 6, 10), "MENSUAL", fin, 10);
ok(iso(atrasado) === "2026-11-10", `mensual atrasado 3 meses salta hasta noviembre (${iso(atrasado)})`);
ok(atrasado !== null && atrasado > fin, "la próxima fecha queda después del fin del período");

// Trimestral vencido en enero, facturando octubre: el primer múltiplo posterior
const trimestral = proximaTrasPeriodo(new Date(2026, 0, 5), "TRIMESTRAL", fin, 5);
ok(iso(trimestral) === "2027-01-05", `trimestral atrasado cae en enero (${iso(trimestral)})`);

// Anual vencido: un solo salto ya alcanza
const anual = proximaTrasPeriodo(new Date(2026, 2, 1), "ANUAL", fin, 1);
ok(iso(anual) === "2027-03-01", `anual avanza al año siguiente (${iso(anual)})`);

// Semestral justo en el borde del período facturado: tiene que pasarlo
const borde = proximaTrasPeriodo(new Date(2026, 3, 31), "SEMESTRAL", fin, 31);
ok(borde !== null && borde > fin, `semestral del 30/4 supera el fin (${iso(borde)})`);

// --- única vez --------------------------------------------------------------
const unica = proximaTrasPeriodo(new Date(2026, 9, 1), "UNICA", fin, 1);
ok(unica === null, "única vez devuelve null para que el servicio se desactive");

// --- día de facturación -----------------------------------------------------
// El 31 en un mes de 30 cae en el último día, no se desborda al mes siguiente
const dia31 = proximaTrasPeriodo(new Date(2026, 9, 31), "MENSUAL", fin, 31);
ok(iso(dia31) === "2026-11-30", `día 31 en noviembre cae el 30 (${iso(dia31)})`);

// Sin día explícito conserva el día de la fecha original
const sinDia = proximaTrasPeriodo(new Date(2026, 9, 17), "MENSUAL", fin, null);
ok(iso(sinDia) === "2026-11-17", `sin día de facturación conserva el 17 (${iso(sinDia)})`);

// --- no entra en bucle con fechas inconsistentes ----------------------------
// Una fecha muy vieja: el tope de iteraciones corta, pero igual tiene que
// devolver algo usable y no colgar la transacción.
const t0 = Date.now();
const viejo = proximaTrasPeriodo(new Date(2010, 0, 1), "MENSUAL", fin, 1);
ok(Date.now() - t0 < 1000, "una fecha de 2010 resuelve sin colgarse");
ok(viejo !== null && viejo > fin, `y queda después del período (${iso(viejo)})`);

console.log(fallos ? `\n${fallos} fallas` : "\nTodo en orden");
process.exit(fallos ? 1 : 0);
