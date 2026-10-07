import { agruparServicios } from "../src/lib/agrupacion";

let fallos = 0;
const ok = (c: boolean, m: string) => {
  if (!c) { fallos++; console.log("FALLA:", m); } else console.log("ok  :", m);
};

const servicio = (id: string, clienteId: string, agrupa: boolean) => ({
  id,
  clienteId,
  cliente: { agruparEnUnaFactura: agrupa },
});

// Un cliente con tres servicios, sin agrupar: tres facturas
const separado = agruparServicios([
  servicio("s1", "c1", false),
  servicio("s2", "c1", false),
  servicio("s3", "c1", false),
]);
ok(separado.length === 3, `3 servicios de un cliente dan 3 comprobantes (${separado.length})`);
ok(separado.every((g) => g.length === 1), "cada comprobante lleva un solo servicio");

// El mismo cliente, agrupando: una sola factura con tres ítems
const junto = agruparServicios([
  servicio("s1", "c1", true),
  servicio("s2", "c1", true),
  servicio("s3", "c1", true),
]);
ok(junto.length === 1, `agrupado da 1 comprobante (${junto.length})`);
ok(junto[0].length === 3, `con los 3 servicios como ítems (${junto[0].length})`);

// Mezcla: c1 agrupa, c2 no
const mixto = agruparServicios([
  servicio("a1", "c1", true),
  servicio("b1", "c2", false),
  servicio("a2", "c1", true),
  servicio("b2", "c2", false),
]);
ok(mixto.length === 3, `2 sueltos + 1 agrupado = 3 comprobantes (${mixto.length})`);
ok(mixto[0].length === 2 && mixto[0].every((s) => s.clienteId === "c1"), "el agrupado junta los dos de c1");
ok(mixto.filter((g) => g[0].clienteId === "c2").length === 2, "c2 queda con dos comprobantes");

// Ningún servicio se pierde ni se duplica
const entrada = [
  servicio("x1", "c1", true), servicio("x2", "c2", false),
  servicio("x3", "c1", true), servicio("x4", "c3", false),
  servicio("x5", "c2", false),
];
const ids = agruparServicios(entrada).flat().map((s) => s.id).sort();
ok(ids.join(",") === "x1,x2,x3,x4,x5", `todos los servicios aparecen una vez (${ids.join(",")})`);

ok(agruparServicios([]).length === 0, "lista vacía da cero comprobantes");

console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLAS`);
process.exit(fallos ? 1 : 0);
