const express = require("express");

const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

require("dotenv").config();

const app = express();
let prisma = new PrismaClient();

function logPrismaError(label, error) {
  console.error(label, {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    meta: error?.meta,
    stack: error?.stack,
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error);
});

const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const FRONTEND_ORIGIN_RAW = process.env.FRONTEND_ORIGIN;
const FRONTEND_ORIGIN = FRONTEND_ORIGIN_RAW
  ? String(FRONTEND_ORIGIN_RAW).trim().replace(/\/+$/, "")
  : "";

if (isProd && !FRONTEND_ORIGIN) {
  throw new Error("Missing required FRONTEND_ORIGIN environment variable");
}

const allowedOrigins = new Set();

if (!isProd) {
  allowedOrigins.add("http://localhost:8080");
}

if (FRONTEND_ORIGIN) {
  allowedOrigins.add(FRONTEND_ORIGIN);
}

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// Admin: delete order + items
app.delete(
  "/api/admin/orders/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid order ID." });
    }

    try {
      if (process.env.ADMIN_DEBUG === "true") {
        const databaseOrders = await withDbRetry(() =>
          prisma.order.findMany({
            select: { id: true },
            orderBy: { id: "desc" },
          })
        );
        console.log(
          "[admin] database order IDs:",
          (Array.isArray(databaseOrders) ? databaseOrders : []).map((o) => o.id)
        );
      }

      const existing = await withDbRetry(() =>
        prisma.order.findUnique({
          where: { id: orderId },
          select: { id: true },
        })
      );
      if (!existing) return res.status(404).json({ success: false, error: "Order not found." });

      const [deletedItemsResult, deletedOrderResult] = await withDbRetry(() =>
        prisma.$transaction([
          prisma.orderItem.deleteMany({ where: { orderId } }),
          prisma.order.deleteMany({ where: { id: orderId } }),
        ])
      );

      if (!deletedOrderResult || deletedOrderResult.count !== 1) {
        return res.status(404).json({
          success: false,
          message: "Order not found or was already deleted.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Order deleted successfully.",
        orderId,
        deletedOrderItems: deletedItemsResult?.count ?? 0,
      });
    } catch (error) {
      console.error("[ADMIN DELETE ORDER ERROR]", {
        orderId,
        code: error?.code,
        message: error?.message,
        meta: error?.meta,
        stack: error?.stack,
      });

      if (error?.code === "P2003") {
        return res.status(409).json({
          success: false,
          message: "Unable to delete order because related records still reference it.",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to delete order",
      });
    }
  })
);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || !JWT_SECRET.trim()) {
  throw new Error("Missing required JWT_SECRET environment variable");
}

const uploadsDir = path.join(__dirname, "public", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
const receiptsDir = path.join(uploadsDir, "receipts");
fs.mkdirSync(receiptsDir, { recursive: true });

app.use("/uploads", express.static(uploadsDir));
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file && file.fieldname === "receipt") return cb(null, receiptsDir);
    return cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    if (file && file.fieldname === "receipt") {
      const ext = path.extname(String(file.originalname || "")).toLowerCase();
      const safeExt = ext && ext.length <= 8 ? ext : "";
      const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      return cb(null, `receipt_${unique}${safeExt}`);
    }

    const safeOriginal = String(file.originalname || "file")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-120);
    cb(null, `${Date.now()}_${safeOriginal}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
    const mime = String(file?.mimetype || "").toLowerCase();
    const ext = path.extname(String(file?.originalname || "")).toLowerCase();
    const extOk = [".jpg", ".jpeg", ".png", ".webp"].includes(ext);

    if (allowed.has(mime) && extOk) return cb(null, true);

    const err = new Error("Unsupported file type. Please upload a JPG, PNG, or WEBP image.");
    err.statusCode = 400;
    return cb(err);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

async function reconnectPrisma() {
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  prisma = new PrismaClient();
  await prisma.$connect();
}

async function withDbRetry(operation) {
  try {
    return await operation();
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    const isTransient =
      msg.includes("Can't reach database server") ||
      msg.includes("Server has closed the connection") ||
      msg.includes("ECONNRESET") ||
      msg.includes("Connection terminated") ||
      msg.includes("P1001") ||
      msg.includes("P1002") ||
      msg.includes("P1017");

    if (!isTransient) throw e;
    await reconnectPrisma();
    return await operation();
  }
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const [type, token] = authHeader.split(" ");
  if (type !== "Bearer" || !token) return null;
  return token;
}

function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: "Admin only" });
  return next();
}

// Admin: update storefront layer only
app.patch(
  "/api/admin/products/:id/storefront-layer",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid product id" });
    }

    const nextLayer = Number(req.body?.storefrontLayer);
    if (!Number.isFinite(nextLayer) || (nextLayer !== 1 && nextLayer !== 2)) {
      return res.status(400).json({ error: "Invalid storefrontLayer (must be 1 or 2)" });
    }

    try {
      const updated = await withDbRetry(() =>
        prisma.product.update({
          where: { id },
          data: { storefrontLayer: nextLayer },
          select: {
            id: true,
            storefrontLayer: true,
          },
        })
      );
      return res.json(updated);
    } catch (e) {
      if (e?.code === "P2025") {
        return res.status(404).json({ error: "Product not found" });
      }
      throw e;
    }
  })
);

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Signup (for customers/admin creation if you allow isAdmin=false)
app.post(
  "/api/signup",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    try {
      const existing = await withDbRetry(() => prisma.user.findUnique({ where: { email } }));
      if (existing) return res.status(409).json({ error: "Email already in use" });

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await withDbRetry(() =>
        prisma.user.create({
          data: { email, passwordHash, isAdmin: false },
          select: { id: true, email: true, isAdmin: true },
        })
      );

      const token = jwt.sign(
        { userId: user.id, email: user.email, isAdmin: user.isAdmin },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      return res.json({ token, isAdmin: user.isAdmin });
    } catch {
      return res.status(500).json({ error: "Signup failed" });
    }
  })
);

// Login (used by Main/login.html)
app.post(
  "/api/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    try {
      const user = await withDbRetry(() => prisma.user.findUnique({ where: { email } }));
      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign(
        { userId: user.id, email: user.email, isAdmin: user.isAdmin },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      return res.json({ token, isAdmin: user.isAdmin });
    } catch {
      return res.status(500).json({ error: "Login failed" });
    }
  })
);

// Public products (optional; useful for frontend later)
app.get(
  "/api/products",
  asyncHandler(async (req, res) => {
    const products = await withDbRetry(() =>
      prisma.product.findMany({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          imageUrl: true,
          description: true,
          usageInstructions: true,
          type: true,
          includes: true,
          storefrontLayer: true,
          isActive: true,
          createdAt: true,
        },
      })
    );
    res.json(products);
  })
);

// Admin: create product (preferred route)
app.post(
  "/api/products",
  requireAuth,
  requireAdmin,
  upload.single("image"),
  asyncHandler(async (req, res) => {
    const {
      name,
      price,
      stock = 0,
      description,
      usageInstructions,
      type,
      includes,
      storefrontLayer,
    } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: "name and price are required" });
    }

    const layerParsed = storefrontLayer === undefined || storefrontLayer === null || String(storefrontLayer).trim() === ""
      ? 1
      : Number(storefrontLayer);
    if (!Number.isFinite(layerParsed) || (layerParsed !== 1 && layerParsed !== 2)) {
      return res.status(400).json({ error: "Invalid storefrontLayer (must be 1 or 2)" });
    }

    const normalizedType = type === "BUNDLE" ? "BUNDLE" : "SINGLE";
    const normalizedIncludes = includes !== undefined && includes !== null ? String(includes).trim() : "";

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const product = await withDbRetry(() =>
      prisma.product.create({
        data: {
          name,
          price,
          stock: Number(stock) || 0,
          imageUrl,
          description: description || null,
          usageInstructions: usageInstructions || null,
          type: normalizedType,
          includes: normalizedType === "BUNDLE" && normalizedIncludes ? normalizedIncludes : null,
          storefrontLayer: layerParsed,
        },
      })
    );

    res.json(product);
  })
);

// Admin: delete product
app.delete(
  "/api/products/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid product id" });

    try {
      const archived = await withDbRetry(() =>
        prisma.product.update({
          where: { id },
          data: { isActive: false },
        })
      );

      return res.json({ ok: true, archived, archivedOnly: true });
    } catch (e) {
      if (e?.code === "P2025") {
        return res.status(404).json({ error: "Product not found" });
      }
      throw e;
    }
  })
);

// Admin: delete product (safe delete; hard delete only when not referenced)
app.delete(
  "/api/admin/products/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid product id" });

    const product = await withDbRetry(() =>
      prisma.product.findUnique({
        where: { id },
        select: { id: true, name: true, isActive: true },
      })
    );

    if (!product) return res.status(404).json({ error: "Product not found" });

    try {
      await withDbRetry(() =>
        prisma.$transaction(async (tx) => {
          const candidateModelNames = [
            "bundleItem",
            "bundle_items",
            "productBundleItem",
            "product_bundle_item",
            "packageItem",
            "package_items",
          ];

          for (const modelName of candidateModelNames) {
            const model = tx?.[modelName];
            if (!model || typeof model.deleteMany !== "function") continue;

            try {
              await model.deleteMany({ where: { productId: id } });
              continue;
            } catch {
              // try snake_case field name
            }

            try {
              await model.deleteMany({ where: { product_id: id } });
            } catch {
              // ignore if model exists but does not support these fields
            }
          }

          await tx.product.delete({ where: { id } });
        })
      );

      return res.status(200).json({
        success: true,
        message: "Product deleted successfully",
        productId: id,
      });
    } catch (error) {
      console.error("[ADMIN DELETE PRODUCT ERROR]", {
        productId: id,
        code: error?.code,
        message: error?.message,
        meta: error?.meta,
        stack: error?.stack,
      });

      if (error?.code === "P2003") {
        return res.status(409).json({
          success: false,
          message: "Unable to delete product because related records still reference it.",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to delete product",
      });
    }
  })
);

// Admin: update product
app.put(
  "/api/products/:id",
  requireAuth,
  requireAdmin,
  upload.single("image"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid product id" });

    const { name, price, stock, description, usageInstructions, existingImageUrl, type, includes, storefrontLayer } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: "name and price are required" });
    }

    const layerParsed = storefrontLayer === undefined || storefrontLayer === null || String(storefrontLayer).trim() === ""
      ? null
      : Number(storefrontLayer);
    if (layerParsed !== null && (!Number.isFinite(layerParsed) || (layerParsed !== 1 && layerParsed !== 2))) {
      return res.status(400).json({ error: "Invalid storefrontLayer (must be 1 or 2)" });
    }

    const normalizedType = type === "BUNDLE" ? "BUNDLE" : "SINGLE";
    const normalizedIncludes = includes !== undefined && includes !== null ? String(includes).trim() : "";

    const nextImageUrl = req.file
      ? `/uploads/${req.file.filename}`
      : existingImageUrl
        ? String(existingImageUrl)
        : null;

    try {
      const updated = await withDbRetry(() =>
        prisma.product.update({
          where: { id },
          data: {
            name,
            price,
            stock: Number(stock) || 0,
            imageUrl: nextImageUrl,
            description: description || null,
            usageInstructions: usageInstructions || null,
            type: normalizedType,
            includes: normalizedType === "BUNDLE" && normalizedIncludes ? normalizedIncludes : null,
            ...(layerParsed === null ? null : { storefrontLayer: layerParsed }),
          },
        })
      );

      return res.json(updated);
    } catch (e) {
      if (e?.code === "P2025") {
        return res.status(404).json({ error: "Product not found" });
      }
      console.error("[ADMIN UPDATE PRODUCT ERROR]", {
        productId: id,
        code: e?.code,
        message: e?.message,
      });
      throw e;
    }
  })
);

app.post(
  "/api/orders",
  upload.single("receipt"),
  asyncHandler(async (req, res) => {
    // Optional auth: allow guest checkout, but link to a user when a token is present
    let requestUserId = null;
    try {
      const maybeToken = getBearerToken(req);
      if (maybeToken) {
        const decoded = jwt.verify(maybeToken, JWT_SECRET);
        const idCandidate = decoded?.userId ?? decoded?.id;
        if (idCandidate !== undefined && idCandidate !== null && String(idCandidate).trim() !== "") {
          requestUserId = Number(idCandidate);
        }
      }
    } catch {
      requestUserId = null;
    }

    const {
      userId,
      gcashReference,
      customerReceiptUrl,
      name,
      phone,
      address,
      userPhone,
      paymentMethod,
      items,
      subtotal,
      shippingFee,
      shipping_fee,
      total,
      total_amount,
    } = req.body;

    const userIdParsed = Number.isFinite(parseInt(userId, 10)) ? parseInt(userId, 10) : null;

    const finalUserId = Number.isFinite(userIdParsed)
      ? userIdParsed
      : Number.isFinite(requestUserId)
        ? Number(requestUserId)
        : 1;

    const receiptImageUrl = req.file ? `/uploads/receipts/${req.file.filename}` : null;
    const finalCustomerReceiptUrl =
      customerReceiptUrl !== undefined && customerReceiptUrl !== null && String(customerReceiptUrl).trim() !== ""
        ? String(customerReceiptUrl).trim()
        : receiptImageUrl;

    const reference =
      gcashReference !== undefined && gcashReference !== null && String(gcashReference).trim() !== ""
        ? String(gcashReference).trim()
        : null;

    const profileName = String(name || "").trim();
    const profilePhone = String(phone || userPhone || "").trim();
    const profileAddress = String(address || "").trim();

    const cleanPaymentMethod = String(paymentMethod || "Cash on Delivery").trim() || "Cash on Delivery";

    const toFiniteMoney = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    };

    const incomingSubtotal = toFiniteMoney(subtotal);
    const incomingShippingFee = Number.isFinite(toFiniteMoney(shippingFee))
      ? toFiniteMoney(shippingFee)
      : toFiniteMoney(shipping_fee);

    const incomingTotalCandidate = Number.isFinite(toFiniteMoney(total)) ? toFiniteMoney(total) : toFiniteMoney(total_amount);

    const parseCartItems = (raw) => {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    const cartItems = parseCartItems(items);

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ message: "Order items are required." });
    }

    const computedSubtotal = cartItems.reduce((sum, it) => {
      const price = Number(it?.price ?? it?.unit_price ?? it?.unitPrice ?? 0);
      const qty = Number(it?.quantity ?? it?.qty ?? 1);
      const unit = Number.isFinite(price) ? price : 0;
      const q = Number.isFinite(qty) ? qty : 1;
      return sum + (unit * q);
    }, 0);

    const finalSubtotal = Number.isFinite(incomingSubtotal) ? incomingSubtotal : computedSubtotal;
    if (!Number.isFinite(finalSubtotal) || finalSubtotal <= 0) {
      return res.status(400).json({ message: "Valid subtotal is required." });
    }

    const finalShippingFee = Number.isFinite(incomingShippingFee) ? incomingShippingFee : 0;
    if (!Number.isFinite(finalShippingFee)) {
      return res.status(400).json({ message: "Valid shipping fee is required." });
    }

    const computedTotal = finalSubtotal + finalShippingFee;
    const finalTotal = Number.isFinite(incomingTotalCandidate) ? incomingTotalCandidate : computedTotal;
    if (!Number.isFinite(finalTotal) || finalTotal <= 0) {
      return res.status(400).json({ message: "Valid total is required." });
    }

    // cartItems validated above

    let order;
    try {
      order = await withDbRetry(() =>
        prisma.$transaction(async (tx) => {
          const userUpdate = {};
          if (profileName) userUpdate.name = profileName;
          if (profilePhone) userUpdate.phone = profilePhone;
          if (profileAddress) userUpdate.address = profileAddress;

          if (Object.keys(userUpdate).length) {
            try {
              await tx.user.update({
                where: { id: parseInt(finalUserId, 10) },
                data: userUpdate,
              });
            } catch (userErr) {
              console.error("User profile update failed during checkout", {
                message: String(userErr?.message || userErr),
                userId: finalUserId,
              });
            }
          }

          const normalizeQty = (q) => {
            const n = Number(q);
            if (!Number.isFinite(n)) return 1;
            return Math.max(1, Math.floor(n));
          };

          const normalizedItems = cartItems
            .map((it) => ({
              productId: parseInt(it?.productId ?? it?._id ?? it?.id, 10),
              quantity: normalizeQty(it?.quantity ?? it?.qty ?? 1),
              variant: String(it?.variant || it?.option || "").trim() || null,
            }))
            .filter((it) => Number.isFinite(it.productId) && it.productId > 0 && it.quantity > 0);

          if (!normalizedItems.length) {
            const err = new Error("Cart is empty");
            err.statusCode = 400;
            throw err;
          }

          const productIds = [...new Set(normalizedItems.map((it) => Number(it.productId)))];
          const products = await tx.product.findMany({ where: { id: { in: productIds }, isActive: true } });
          const byId = new Map(products.map((p) => [Number(p.id), p]));

          const missingIds = productIds.filter((pid) => !byId.has(Number(pid)));
          if (missingIds.length) {
            const err = new Error(
              `Some products are missing, inactive, or invalid IDs were sent: ${missingIds.join(", ")}`
            );
            err.statusCode = 400;
            throw err;
          }

          for (const it of normalizedItems) {
            const p = byId.get(Number(it.productId));
            if (!p) continue;
            if (Number(p.stock) < Number(it.quantity)) {
              const err = new Error("Out of stock");
              err.statusCode = 409;
              throw err;
            }
          }

          for (const it of normalizedItems) {
            await tx.product.update({
              where: { id: Number(it.productId) },
              data: { stock: { decrement: Number(it.quantity) } },
            });
          }

          const orderCustomerName = profileName || String(req.body?.buyerName || "").trim() || "Guest Customer";
          const orderPhone = profilePhone || "";
          const orderAddress = profileAddress || String(req.body?.shippingAddress || "").trim() || "";

          if (!orderCustomerName || !orderPhone || !orderAddress) {
            const err = new Error("Missing customer details");
            err.statusCode = 400;
            throw err;
          }

          const created = await tx.order.create({
            data: {
              status: "Pending",
              userId: parseInt(finalUserId, 10),
              customerName: orderCustomerName,
              phone: orderPhone,
              address: orderAddress,
              subtotal: finalSubtotal,
              shippingFee: finalShippingFee,
              total: finalTotal,
              paymentMethod: cleanPaymentMethod,
              receiptRef: null,
              customerReceiptUrl: finalCustomerReceiptUrl || null,
              items: {
                create: normalizedItems.map((it) => {
                  const p = byId.get(Number(it.productId));
                  return {
                    productId: Number(it.productId),
                    productName: String(p?.name || ""),
                    variant: it.variant,
                    quantity: Number(it.quantity),
                    unitPrice: p.price,
                  };
                }),
              },
            },
            include: {
              user: true,
              items: true,
            },
          });

          const receiptRef = reference || `ADM-${created.id}-${Date.now()}`;
          return tx.order.update({
            where: { id: created.id },
            data: { receiptRef },
            include: { user: true, items: true },
          });
        })
      );
    } catch (e) {
      if (req.file && req.file.path) {
        try {
          await fs.promises.unlink(req.file.path);
        } catch {
          // ignore cleanup errors
        }
      }

      if (e?.code === "P2022") {
        console.error("[ORDER CREATE SCHEMA ERROR]", {
          code: e?.code,
          column: e?.meta?.column,
          modelName: e?.meta?.modelName,
          message: e?.message,
        });
      } else {
        console.error("Order create failed (Prisma)", {
          code: e?.code,
          message: e?.message,
          meta: e?.meta,
        });
      }

      return res.status(500).json({
        success: false,
        message: "The order could not be saved because the database schema is not synchronized.",
      });
    }

    console.log("Order created successfully", {
      id: order?.id,
      itemsCount: Array.isArray(order?.items) ? order.items.length : 0,
      hasReceipt: Boolean(order?.customerReceiptUrl),
    });
    return res.status(201).json(order);
  })
);

// Public: list orders (grouped with items[]) - intended for dashboards/frontends
app.get(
  "/api/orders",
  asyncHandler(async (req, res) => {
    try {
      const orders = await withDbRetry(() =>
        prisma.order.findMany({
          orderBy: { id: "desc" },
          include: {
            user: { select: { id: true, email: true, name: true, phone: true, address: true } },
            items: true,
          },
        })
      );

      const normalized = (Array.isArray(orders) ? orders : []).map((o) => {
        const items = (Array.isArray(o?.items) ? o.items : [])
          .map((it) => {
            const quantity = Number(it?.quantity ?? 0) || 0;
            const price = it?.unitPrice !== undefined && it?.unitPrice !== null ? Number(it.unitPrice) : 0;
            const subtotal = price * quantity;
            return {
              productId: it?.productId ?? null,
              productName: String(it?.productName || "").trim(),
              variant: it?.variant !== undefined && it?.variant !== null ? String(it.variant).trim() : null,
              quantity,
              unitPrice: price,
              price,
              subtotal,
            };
          })
          .filter((it) => it.productName && it.quantity > 0);

        const itemsSubtotal = items.reduce((sum, it) => sum + (Number(it?.subtotal) || 0), 0);
        const subtotalFromDb = o?.subtotal !== undefined && o?.subtotal !== null ? Number(o.subtotal) : NaN;
        const normalizedSubtotal = Number.isFinite(subtotalFromDb) ? subtotalFromDb : itemsSubtotal;

        const shippingFeeRaw =
          o?.shippingFee !== undefined && o?.shippingFee !== null
            ? Number(o.shippingFee)
            : o?.shipping_fee !== undefined && o?.shipping_fee !== null
              ? Number(o.shipping_fee)
              : o?.deliveryFee !== undefined && o?.deliveryFee !== null
                ? Number(o.deliveryFee)
                : o?.delivery_fee !== undefined && o?.delivery_fee !== null
                  ? Number(o.delivery_fee)
                  : 0;
        const shippingFee = Number.isFinite(shippingFeeRaw) ? shippingFeeRaw : 0;
        const totalFromDb = o?.total !== undefined && o?.total !== null ? Number(o.total) : NaN;
        const total = Number.isFinite(totalFromDb)
          ? totalFromDb
          : normalizedSubtotal + (Number.isFinite(shippingFee) ? shippingFee : 0);

        return {
          id: o.id,
          createdAt: o.createdAt,
          customerName: String(o?.customerName || "").trim() || String(o?.user?.name || "").trim() || String(o?.user?.email || "").trim(),
          phone: String(o?.phone || "").trim() || String(o?.user?.phone || "").trim(),
          address: String(o?.address || "").trim() || String(o?.user?.address || "").trim(),
          paymentMethod: String(o?.paymentMethod || "Cash on Delivery").trim(),
          paymentStatus: String(o?.paymentStatus || "Pending").trim(),
          orderStatus: String(o?.orderStatus || o?.status || "Pending").trim(),
          subtotal: Number.isFinite(normalizedSubtotal) ? normalizedSubtotal : 0,
          shippingFee: Number.isFinite(shippingFee) ? shippingFee : 0,
          shipping_fee: Number.isFinite(shippingFee) ? shippingFee : 0,
          total,
          total_amount: total,
          items,
        };
      });

      return res.status(200).json(normalized);
    } catch (error) {
      logPrismaError("[GET /api/orders]", error);
      return res.status(500).json({
        success: false,
        message: "Failed to load orders",
        error: error?.message,
        code: error?.code,
        meta: error?.meta,
      });
    }
  })
);

// Admin: create product
app.post(
  "/api/admin/products",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, price, stock = 0, imageUrl, description, usageInstructions, type, includes } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: "name and price are required" });
    }

    const normalizedType = type === "BUNDLE" ? "BUNDLE" : "SINGLE";
    const normalizedIncludes = includes !== undefined && includes !== null ? String(includes).trim() : "";

    const product = await withDbRetry(() =>
      prisma.product.create({
        data: {
          name,
          price,
          stock: Number(stock) || 0,
          imageUrl: imageUrl || null,
          description: description || null,
          usageInstructions: usageInstructions || null,
          type: normalizedType,
          includes: normalizedType === "BUNDLE" && normalizedIncludes ? normalizedIncludes : null,
        },
      })
    );

    res.json(product);
  })
);

// Buy endpoint (used by Main/script.js)
app.post(
  "/api/buy",
  asyncHandler(async (req, res) => {
    const { userId, productId } = req.body;

    if (!userId || !productId) {
      return res.status(400).json({ error: "userId and productId are required" });
    }

    const product = await withDbRetry(() => prisma.product.findUnique({ where: { id: Number(productId) } }));
    if (!product || !product.isActive) return res.status(404).json({ error: "Product not found" });
    if (product.stock <= 0) return res.status(409).json({ error: "Out of stock" });

    const order = await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: product.id },
          data: { stock: { decrement: 1 } },
        });

        return tx.order.create({
          data: {
            userId: Number(userId),
            status: "Pending",
            customerName: "Guest Customer",
            phone: "",
            address: "",
            paymentMethod: "Cash on Delivery",
            items: {
              create: {
                productId: product.id,
                productName: product.name,
                variant: null,
                quantity: 1,
                unitPrice: product.price,
              },
            },
          },
          include: { items: true },
        });
      })
    );

    res.json(order);
  })
);

// Admin: list orders (used by Main/admin.html)
app.get(
  "/api/admin/orders",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    try {
      const orders = await withDbRetry(() =>
        prisma.order.findMany({
          orderBy: { id: "desc" },
          select: {
            id: true,
            createdAt: true,
            status: true,
            customerName: true,
            phone: true,
            address: true,
            subtotal: true,
            shippingFee: true,
            total: true,
            paymentMethod: true,
            paymentStatus: true,
            orderStatus: true,
            courierName: true,
            trackingNumber: true,
            receiptRef: true,
            customerReceiptUrl: true,
            user: { select: { id: true, email: true, name: true, phone: true, address: true } },
            items: {
              select: {
                id: true,
                orderId: true,
                productId: true,
                productName: true,
                variant: true,
                quantity: true,
                unitPrice: true,
                createdAt: true,
              },
            },
          },
        })
      );

      if (process.env.ADMIN_DEBUG === "true") {
        console.log(
          "[admin] order IDs returned by API:",
          (Array.isArray(orders) ? orders : []).map((o) => o.id)
        );
      }

      const normalized = (Array.isArray(orders) ? orders : []).map((o) => {
        const items = (Array.isArray(o?.items) ? o.items : [])
          .map((it) => {
            const quantity = Number(it?.quantity ?? 0) || 0;
            const price = it?.unitPrice !== undefined && it?.unitPrice !== null ? Number(it.unitPrice) : 0;
            const subtotal = price * quantity;
            return {
              productId: it?.productId ?? null,
              productName: String(it?.productName || "").trim(),
              variant: it?.variant !== undefined && it?.variant !== null ? String(it.variant).trim() : null,
              quantity,
              unitPrice: price,
              price,
              subtotal,
            };
          })
          .filter((it) => it.productName && it.quantity > 0);

        const itemsSubtotal = items.reduce((sum, it) => sum + (Number(it?.subtotal) || 0), 0);
        const subtotalFromDb = o?.subtotal !== undefined && o?.subtotal !== null ? Number(o.subtotal) : NaN;
        const normalizedSubtotal = Number.isFinite(subtotalFromDb) ? subtotalFromDb : itemsSubtotal;

        const shippingFeeRaw =
          o?.shippingFee !== undefined && o?.shippingFee !== null
            ? Number(o.shippingFee)
            : o?.shipping_fee !== undefined && o?.shipping_fee !== null
              ? Number(o.shipping_fee)
              : o?.deliveryFee !== undefined && o?.deliveryFee !== null
                ? Number(o.deliveryFee)
                : o?.delivery_fee !== undefined && o?.delivery_fee !== null
                  ? Number(o.delivery_fee)
                  : 0;

        const shippingFee = Number.isFinite(shippingFeeRaw) ? shippingFeeRaw : 0;
        const total = normalizedSubtotal + (Number.isFinite(shippingFee) ? shippingFee : 0);

        return {
          id: o.id,
          createdAt: o.createdAt,
          customerName:
            String(o?.customerName || "").trim() ||
            String(o?.user?.name || "").trim() ||
            String(o?.user?.email || "").trim(),
          phone: String(o?.phone || "").trim() || String(o?.user?.phone || "").trim(),
          address: String(o?.address || "").trim() || String(o?.user?.address || "").trim(),
          paymentMethod: String(o?.paymentMethod || "Cash on Delivery").trim(),
          paymentStatus: String(o?.paymentStatus || "Pending").trim(),
          orderStatus: String(o?.orderStatus || o?.status || "Pending").trim(),
          customerReceiptUrl:
            o?.customerReceiptUrl !== undefined && o?.customerReceiptUrl !== null && String(o.customerReceiptUrl).trim() !== ""
              ? String(o.customerReceiptUrl).trim()
              : null,
          subtotal: Number.isFinite(normalizedSubtotal) ? normalizedSubtotal : 0,
          shippingFee: Number.isFinite(shippingFee) ? shippingFee : 0,
          shipping_fee: Number.isFinite(shippingFee) ? shippingFee : 0,
          total,
          total_amount: total,
          items,
        };
      });

      return res.status(200).json(normalized);
    } catch (error) {
      logPrismaError("[GET /api/admin/orders]", error);
      return res.status(500).json({
        success: false,
        message: "Failed to load admin orders",
        error: error?.message,
        code: error?.code,
        meta: error?.meta,
      });
    }
  })
);

// Admin: update payment/order status fields
app.patch(
  "/api/admin/orders/:id/status",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid order id" });

    const { paymentStatus, orderStatus, courierName, trackingNumber, paymentMethod } = req.body || {};
    const data = {};
    if (paymentStatus !== undefined) data.paymentStatus = String(paymentStatus);
    if (courierName !== undefined) data.courierName = String(courierName || "").trim() || null;
    if (trackingNumber !== undefined) data.trackingNumber = String(trackingNumber || "").trim() || null;
    if (paymentMethod !== undefined) data.paymentMethod = String(paymentMethod || "").trim() || "Cash on Delivery";
    if (orderStatus !== undefined) {
      const incoming = String(orderStatus);
      // Map UI orderStatus to DB enum field when applicable
      if (/^shipped$/i.test(incoming)) data.status = "Shipped";
      if (/^pending$/i.test(incoming)) data.status = "Pending";
      data.orderStatus = incoming;
    }

    const updated = await withDbRetry(() =>
      prisma.order.update({
        where: { id },
        data,
        include: { user: { select: { id: true, email: true, name: true, phone: true, address: true } }, items: true },
      })
    );

    res.json(updated);
  })
);

// Admin: approve & issue receipt (mark completed + return invoice template)
app.post(
  "/api/admin/orders/:id/complete",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid order id" });

    const updated = await withDbRetry(() =>
      prisma.order.update({
        where: { id },
        data: { status: "Shipped" },
        include: { user: true, items: true },
      })
    );

    const invoiceItems = (Array.isArray(updated?.items) ? updated.items : []).map((it) => {
      const qty = Number(it?.quantity) || 0;
      const unit = it?.unitPrice !== undefined && it?.unitPrice !== null ? Number(it.unitPrice) : 0;
      return {
        productId: Number(it?.productId),
        name: String(it?.productName || ""),
        variant: String(it?.variant || ""),
        quantity: qty,
        unitPrice: unit,
        lineTotal: unit * qty,
      };
    }).filter((it) => it.name && it.quantity > 0);

    const subtotal = invoiceItems.reduce((sum, it) => sum + (Number(it?.lineTotal) || 0), 0);
    const shippingRaw = updated?.shippingFee !== undefined && updated?.shippingFee !== null ? Number(updated.shippingFee) : 0;
    const shipping = Number.isFinite(shippingRaw) ? shippingRaw : 0;
    const discount = 0;
    const total = subtotal + shipping - discount;

    const buyerName = String(updated?.customerName || updated?.user?.name || updated?.user?.email || "").trim();
    const phone = String(updated?.phone || updated?.user?.phone || "").trim();
    const shippingAddress = String(updated?.address || updated?.user?.address || "").trim();
    const invoice = {
      invoiceNo: `INV-${String(updated.id).padStart(6, "0")}`,
      orderId: updated.id,
      status: "Completed",
      buyerName,
      phone,
      shippingAddress,
      courierName: String(updated?.courierName || "").trim(),
      trackingNumber: String(updated?.trackingNumber || "").trim(),
      paymentMethod: String(updated?.paymentMethod || "").trim(),
      orderStatus: String(updated?.status || "").trim(),
      createdAt: updated.createdAt,
      items: invoiceItems,
      totals: {
        subtotal,
        shipping,
        discount,
        total,
      },
    };

    res.json({ order: updated, invoice });
  })
);

// Admin: mark shipped
app.patch(
  "/api/admin/orders/:id/ship",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const order = await withDbRetry(() =>
      prisma.order.update({
        where: { id },
        data: { status: "Shipped" },
        include: { user: true, items: true },
      })
    );
    res.json(order);
  })
);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Image is too large. Please upload a smaller file." });
    }
    return res.status(400).json({ error: "Upload failed. Please try again." });
  }

  const message = String(err && err.message ? err.message : err);
  if (message.includes("CORS blocked for origin")) {
    return res.status(403).json({ error: "This device is not allowed to access the server yet." });
  }

  console.error("Unhandled API Error:", err);
  const statusCode = err && typeof err === "object" && err.statusCode ? Number(err.statusCode) : 500;

  const rawMessage = String(err && err.message ? err.message : err);
  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";

  if (statusCode === 500) {
    return res.status(500).json({
      message: isProd ? "Something went wrong, please try again!" : rawMessage,
    });
  }

  return res.status(statusCode).json({ message: String(err.message || "Request failed") });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
