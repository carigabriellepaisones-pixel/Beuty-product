const { PrismaClient } = require("@prisma/client");

require("dotenv").config();

async function main() {
  const prisma = new PrismaClient();

  try {
    const latest = await prisma.order.findFirst({
      orderBy: { id: "desc" },
      select: {
        id: true,
        createdAt: true,
        userId: true,
        customerName: true,
        paymentMethod: true,
      },
    });

    console.log("LATEST_ORDER:", latest);

    if (!latest) return;

    const items = await prisma.orderItem.findMany({
      where: { orderId: latest.id },
      select: {
        id: true,
        orderId: true,
        productId: true,
        quantity: true,
        productName: true,
      },
    });

    console.log("LATEST_ORDER_ITEMS:", items);

    const productIds = [...new Set(items.map((i) => i.productId))];

    if (productIds.length) {
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, stock: true },
      });

      console.log("PRODUCT_STOCKS_FOR_LATEST_ORDER_ITEMS:", products);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("INSPECT FAILED:", e);
  process.exit(1);
});
