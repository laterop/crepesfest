import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { nanoid } from "nanoid";
import { db, initDb } from "./db.js";

const PORT = process.env.PORT || 4000;

await initDb();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// -------- Helpers --------
const STATUSES = ["nouvelle", "en_preparation", "prete", "servie", "annulee"];

function computeOrderTotal(items) {
  return items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0);
}

function activeOrders() {
  return db.data.orders.filter((o) => !o.archived);
}

function broadcastOrders() {
  io.emit("orders:update", activeOrders());
}

// -------- Menu --------
app.get("/api/menu", (req, res) => {
  res.json(db.data.menu);
});

app.post("/api/menu", async (req, res) => {
  const { name, price, category, available = true, color } = req.body;
  if (!name || price == null) {
    return res.status(400).json({ error: "name et price sont requis" });
  }
  const item = {
    id: nanoid(8),
    name,
    price: Number(price),
    category: category || "autre",
    available,
    color: color || db.data.categoryColors[category] || "#e0c9a6"
  };
  db.data.menu.push(item);
  await db.write();
  io.emit("menu:update", db.data.menu);
  res.status(201).json(item);
});

// -------- Couleurs de categorie --------
app.get("/api/category-colors", (req, res) => {
  res.json(db.data.categoryColors);
});

app.put("/api/category-colors", async (req, res) => {
  Object.assign(db.data.categoryColors, req.body);
  await db.write();
  io.emit("menu:update", db.data.menu);
  res.json(db.data.categoryColors);
});

// -------- Reglages caisse --------
app.get("/api/settings", (req, res) => {
  res.json(db.data.settings);
});

app.put("/api/settings", async (req, res) => {
  Object.assign(db.data.settings, req.body);
  await db.write();
  res.json(db.data.settings);
});

app.put("/api/menu/:id", async (req, res) => {
  const item = db.data.menu.find((m) => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: "produit introuvable" });
  Object.assign(item, req.body);
  await db.write();
  io.emit("menu:update", db.data.menu);
  res.json(item);
});

app.delete("/api/menu/:id", async (req, res) => {
  db.data.menu = db.data.menu.filter((m) => m.id !== req.params.id);
  await db.write();
  io.emit("menu:update", db.data.menu);
  res.status(204).end();
});

// -------- Orders --------
app.get("/api/orders", (req, res) => {
  const { status, all } = req.query;
  let orders = all ? db.data.orders : activeOrders();
  if (status) orders = orders.filter((o) => o.status === status);
  res.json(orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
});

app.post("/api/orders", async (req, res) => {
  const { items, payments, customerName } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "la commande doit contenir au moins un article" });
  }
  if (!Array.isArray(payments) || payments.length === 0) {
    return res.status(400).json({ error: "la commande doit contenir au moins un paiement" });
  }

  let enrichedItems;
  try {
    enrichedItems = items.map((it) => {
      const menuItem = db.data.menu.find((m) => m.id === it.menuItemId);
      if (!menuItem) throw new Error(`produit inconnu: ${it.menuItemId}`);
      return {
        menuItemId: menuItem.id,
        name: menuItem.name,
        unitPrice: menuItem.price,
        qty: it.qty || 1
      };
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const total = Math.round(computeOrderTotal(enrichedItems) * 100) / 100;

  const paymentsTotal =
    Math.round(payments.reduce((sum, p) => sum + Number(p.amount || 0), 0) * 100) / 100;
  if (Math.abs(paymentsTotal - total) > 0.01) {
    return res.status(400).json({
      error: `le total des paiements (${paymentsTotal.toFixed(2)} EUR) ne correspond pas au total de la commande (${total.toFixed(2)} EUR)`
    });
  }

  const enrichedPayments = payments.map((p) => {
    const amount = Math.round(Number(p.amount || 0) * 100) / 100;
    const entry = { method: p.method, amount };
    if (Array.isArray(p.items) && p.items.length > 0) {
      entry.items = p.items.map((it) => ({
        menuItemId: it.menuItemId,
        name: it.name,
        qty: it.qty
      }));
    }
    if (p.method === "especes") {
      const received = Number(p.cashReceived ?? amount);
      entry.cashReceived = received;
      entry.change = Math.max(0, Math.round((received - amount) * 100) / 100);
    } else if (p.method === "qr") {
      entry.qrRef = `CREPESFEST-${nanoid(6).toUpperCase()}`;
      entry.paid = false;
    } else if (p.method === "cb") {
      entry.paid = false;
    }
    return entry;
  });

  db.data.counter += 1;
  const order = {
    id: nanoid(10),
    number: db.data.counter,
    customerName: customerName || "",
    items: enrichedItems,
    total,
    payments: enrichedPayments,
    status: "nouvelle",
    archived: false,
    createdAt: new Date().toISOString()
  };

  db.data.orders.push(order);
  await db.write();

  io.emit("orders:new", order);
  broadcastOrders();

  res.status(201).json(order);
});

app.patch("/api/orders/:id/status", async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `statut invalide, valeurs possibles: ${STATUSES.join(", ")}` });
  }
  const order = db.data.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "commande introuvable" });
  order.status = status;
  order.updatedAt = new Date().toISOString();
  await db.write();
  broadcastOrders();
  res.json(order);
});

app.patch("/api/orders/:id/paiement", async (req, res) => {
  const order = db.data.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "commande introuvable" });
  const { paymentIndex } = req.body;
  const payments = order.payments || [];
  if (paymentIndex != null && payments[paymentIndex]) {
    payments[paymentIndex].paid = true;
  } else {
    for (const p of payments) p.paid = true;
  }
  await db.write();
  broadcastOrders();
  res.json(order);
});

// -------- Stats --------
function computeStats(orders) {
  const kept = orders.filter((o) => o.status !== "annulee");
  const totalVentes = kept.reduce((sum, o) => sum + o.total, 0);
  const nbCommandes = kept.length;

  const parProduit = {};
  for (const o of kept) {
    for (const it of o.items) {
      parProduit[it.name] = (parProduit[it.name] || 0) + it.qty;
    }
  }
  const topProduits = Object.entries(parProduit)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty);

  const parPaiement = {};
  for (const o of kept) {
    const pays = o.payments || (o.payment ? [{ method: o.payment.method, amount: o.total }] : []);
    for (const p of pays) {
      const m = p.method || "inconnu";
      parPaiement[m] = (parPaiement[m] || 0) + p.amount;
    }
  }

  return {
    totalVentes: Math.round(totalVentes * 100) / 100,
    nbCommandes,
    panierMoyen: nbCommandes ? Math.round((totalVentes / nbCommandes) * 100) / 100 : 0,
    topProduits,
    parPaiement
  };
}

app.get("/api/stats", (req, res) => {
  res.json(computeStats(activeOrders()));
});

// -------- Cloture de caisse (ticket Z) --------
app.get("/api/clotures", (req, res) => {
  res.json(db.data.clotures);
});

app.post("/api/cloture", async (req, res) => {
  const orders = activeOrders();
  if (orders.length === 0) {
    return res.status(400).json({ error: "aucune commande a cloturer" });
  }
  const stats = computeStats(orders);
  const fondDeCaisse = Math.round(Number(db.data.settings.fondDeCaisse || 0) * 100) / 100;
  const especesAttendues = Math.round((fondDeCaisse + (stats.parPaiement.especes || 0)) * 100) / 100;

  const report = {
    id: nanoid(8),
    date: new Date().toISOString(),
    ...stats,
    fondDeCaisse,
    especesAttendues
  };

  db.data.clotures.unshift(report);
  for (const o of db.data.orders) {
    if (!o.archived) o.archived = true;
  }
  db.data.counter = 0;
  await db.write();
  broadcastOrders();

  res.status(201).json(report);
});

io.on("connection", (socket) => {
  socket.emit("orders:update", activeOrders());
});

server.listen(PORT, () => {
  console.log(`CrepesFest API + Socket.io sur http://localhost:${PORT}`);
});
