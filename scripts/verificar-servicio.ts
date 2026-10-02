import { esquemaServicio } from "../src/app/(app)/servicios/esquema";

let fallos = 0;
const ok = (c: boolean, m: string) => {
  if (!c) { fallos++; console.log("FALLA:", m); } else console.log("ok  :", m);
};

/** Reproduce lo que el navegador manda: los campos deshabilitados no viajan. */
function formulario(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  return {
    ...Object.fromEntries(fd.entries()),
    activo: fd.get("activo") === "on",
    facturaPorAdelantado: fd.get("facturaPorAdelantado") === "on",
  };
}

const comunes = {
  clienteId: "clx123",
  nombre: "Abono mensual de soporte",
  descripcion: "Soporte técnico",
  moneda: "PES",
  alicuotaIVA: "21",
  cantidad: "1",
  unidad: "Unidad",
  periodicidadFacturacion: "MENSUAL",
  diaFacturacion: "1",
  fechaInicio: "2026-01-01",
  tipoAjuste: "NINGUNO",
  diasVencimiento: "30",
  activo: "on",
  facturaPorAdelantado: "on",
};

// --- el caso que fallaba: editar, con el precio base deshabilitado
const edicion = esquemaServicio.safeParse(formulario(comunes));
ok(edicion.success, `editar sin precioBase (el campo va deshabilitado): ${
  edicion.success ? "pasa" : edicion.error.issues.map((i) => i.message).join(" · ")
}`);
if (edicion.success) {
  ok(edicion.data.precioBase === undefined, "precioBase queda undefined al editar");
  ok(edicion.data.diasVencimiento === 30, "el resto de los campos se parsea igual");
}

// --- alta: el precio sí viaja
const alta = esquemaServicio.safeParse(formulario({ ...comunes, precioBase: "150000.50" }));
ok(alta.success && alta.data.precioBase === 150000.5, "alta con precio: 150000.50");

// --- un precio inválido se sigue rechazando
const negativo = esquemaServicio.safeParse(formulario({ ...comunes, precioBase: "-5" }));
ok(!negativo.success, "precio negativo se rechaza");

const texto = esquemaServicio.safeParse(formulario({ ...comunes, precioBase: "abc" }));
ok(!texto.success, "precio no numérico se rechaza");

// --- mensajes legibles en vez de "expected number, received NaN"
const dia = esquemaServicio.safeParse(formulario({ ...comunes, diaFacturacion: "" }));
if (!dia.success) {
  const msg = dia.error.issues.map((i) => i.message).join(" · ");
  ok(!/NaN|expected number/i.test(msg), `día vacío da un mensaje legible: "${msg}"`);
}

const dia40 = esquemaServicio.safeParse(formulario({ ...comunes, diaFacturacion: "40" }));
ok(!dia40.success, "día de facturación fuera de rango se rechaza");

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLAS`);
process.exit(fallos ? 1 : 0);
