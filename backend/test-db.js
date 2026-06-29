const { PrismaClient } = require("@prisma/client");

require("dotenv").config();

async function main() {
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    const result = await prisma.$queryRaw`SELECT 1 as ok`;
    console.log("DB connection OK:", result);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("DB connection FAILED:", e);
  process.exit(1);
});
