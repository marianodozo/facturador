import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@empresa.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "cambiar123";

  const admin = await prisma.usuario.upsert({
    where: { email },
    create: {
      email,
      nombre: "Administrador",
      rol: "ADMIN",
      passwordHash: await bcrypt.hash(password, 12),
    },
    update: {},
  });
  console.log(`Usuario administrador: ${admin.email}`);

  await prisma.empresa.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      razonSocial: "MI EMPRESA S.A.",
      cuit: "30000000007",
      condicionIVA: "RESPONSABLE_INSCRIPTO",
      arcaAmbiente: "PRODUCCION",
      ptoVtaDefault: 1,
      conceptoDefault: 2,
      leyendaPie: "Gracias por su confianza.",
    },
    update: {},
  });

  await prisma.puntoVenta.upsert({
    where: { numero: 1 },
    create: { numero: 1, descripcion: "Casa central" },
    update: {},
  });

  // Índices típicos para ajustar contratos de servicios en Argentina.
  // Los que tienen fuenteId se pueden actualizar solos desde Índices.
  const indices = [
    {
      codigo: "IPC",
      nombre: "Índice de Precios al Consumidor",
      fuente: "INDEC",
      fuenteTipo: "DATOS_GOB" as const,
      fuenteId: "148.3_INIVELNAL_DICI_M_26",
    },
    {
      codigo: "ICL",
      nombre: "Índice para Contratos de Locación",
      fuente: "BCRA",
      fuenteTipo: "BCRA" as const,
      fuenteId: "40",
    },
    {
      codigo: "CER",
      nombre: "Coeficiente de Estabilización de Referencia",
      fuente: "BCRA",
      fuenteTipo: "BCRA" as const,
      fuenteId: "30",
    },
    {
      codigo: "UVA",
      nombre: "Unidad de Valor Adquisitivo",
      fuente: "BCRA",
      fuenteTipo: "BCRA" as const,
      fuenteId: "31",
    },
    {
      codigo: "PARITARIA",
      nombre: "Ajuste por paritaria del sector",
      fuente: "Cámara",
      fuenteTipo: "MANUAL" as const,
      fuenteId: null,
    },
  ];

  for (const i of indices) {
    await prisma.indice.upsert({
      where: { codigo: i.codigo },
      create: i,
      update: {},
    });
  }

  // Serie de ejemplo del IPC (base arbitraria) para poder probar los ajustes
  const ipc = await prisma.indice.findUniqueOrThrow({ where: { codigo: "IPC" } });
  const serie: [string, number][] = [
    ["2026-01", 1000],
    ["2026-02", 1023.5],
    ["2026-03", 1049.1],
    ["2026-04", 1071.2],
    ["2026-05", 1093.7],
    ["2026-06", 1118.4],
    ["2026-07", 1140.8],
    ["2026-08", 1165.2],
  ];
  for (const [periodo, valor] of serie) {
    await prisma.indiceValor.upsert({
      where: { indiceId_periodo: { indiceId: ipc.id, periodo } },
      create: { indiceId: ipc.id, periodo, valor },
      update: { valor },
    });
  }

  console.log("Seed completo. Cargá el certificado de ARCA en Configuración antes de facturar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
