const { PrismaClient } = require("@prisma/client");

require("dotenv").config();

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT id, subtotal, shipping_fee, total FROM `order` WHERE id = 22"
    );
    console.log("ORDER_22_TOTALS:", rows);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("INSPECT FAILED:", e);
  process.exit(1);
});
