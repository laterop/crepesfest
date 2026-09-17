import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { API_URL } from "./config.js";

const PAYMENT_METHODS = [
  { id: "especes", label: "Especes" },
  { id: "cb", label: "Carte bancaire" },
  { id: "qr", label: "QR code / mobile" }
];

export default function App() {
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState({}); // menuItemId -> qty
  const [paymentMethod, setPaymentMethod] = useState("especes");
  const [cashReceived, setCashReceived] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [lastOrder, setLastOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [cbConfirmed, setCbConfirmed] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/menu`)
      .then((r) => r.json())
      .then(setMenu)
      .catch(() => setError("Impossible de charger le menu, verifie que le serveur tourne"));
  }, []);

  const categories = useMemo(() => {
    const map = {};
    for (const item of menu) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    }
    return map;
  }, [menu]);

  const cartLines = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const item = menu.find((m) => m.id === id);
        return item ? { ...item, qty } : null;
      })
      .filter(Boolean);
  }, [cart, menu]);

  const total = useMemo(
    () => cartLines.reduce((sum, l) => sum + l.price * l.qty, 0),
    [cartLines]
  );

  const change =
    paymentMethod === "especes" && cashReceived !== ""
      ? Math.max(0, Math.round((Number(cashReceived) - total) * 100) / 100)
      : null;

  function addToCart(id) {
    setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  }

  function decFromCart(id) {
    setCart((c) => {
      const next = { ...c, [id]: Math.max(0, (c[id] || 0) - 1) };
      return next;
    });
  }

  function resetOrder() {
    setCart({});
    setCashReceived("");
    setCustomerName("");
    setCbConfirmed(false);
    setPaymentMethod("especes");
  }

  async function submitOrder() {
    if (cartLines.length === 0) return;
    if (paymentMethod === "cb" && !cbConfirmed) {
      setError("Confirme le paiement CB sur le terminal avant de valider");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartLines.map((l) => ({ menuItemId: l.id, qty: l.qty })),
          paymentMethod,
          customerName,
          cashReceived: paymentMethod === "especes" ? Number(cashReceived || 0) : undefined
        })
      });
      if (!res.ok) throw new Error("Echec de la commande");
      const order = await res.json();
      setLastOrder(order);
      resetOrder();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>CrepesFest - Caisse</h1>
      </header>

      <div className="layout">
        <section className="menu">
          {Object.entries(categories).map(([cat, items]) => (
            <div key={cat} className="category">
              <h2>{cat}</h2>
              <div className="grid">
                {items.map((item) => (
                  <button
                    key={item.id}
                    className="menu-item"
                    disabled={!item.available}
                    onClick={() => addToCart(item.id)}
                  >
                    <span className="name">{item.name}</span>
                    <span className="price">{item.price.toFixed(2)} EUR</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <aside className="cart">
          <h2>Commande en cours</h2>
          <input
            className="customer-input"
            placeholder="Nom du client (optionnel)"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />

          <ul className="cart-lines">
            {cartLines.length === 0 && <li className="empty">Panier vide</li>}
            {cartLines.map((l) => (
              <li key={l.id} className="cart-line">
                <span>{l.name}</span>
                <div className="qty-controls">
                  <button onClick={() => decFromCart(l.id)}>-</button>
                  <span>{l.qty}</span>
                  <button onClick={() => addToCart(l.id)}>+</button>
                </div>
                <span className="line-total">{(l.price * l.qty).toFixed(2)} EUR</span>
              </li>
            ))}
          </ul>

          <div className="total">Total: {total.toFixed(2)} EUR</div>

          <div className="payment">
            <h3>Paiement</h3>
            <div className="payment-methods">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  className={paymentMethod === m.id ? "active" : ""}
                  onClick={() => {
                    setPaymentMethod(m.id);
                    setCbConfirmed(false);
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {paymentMethod === "especes" && (
              <div className="especes-block">
                <label>
                  Montant recu
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                  />
                </label>
                {change !== null && (
                  <div className="change">Monnaie a rendre: {change.toFixed(2)} EUR</div>
                )}
              </div>
            )}

            {paymentMethod === "cb" && (
              <div className="cb-block">
                <p>Lance le paiement sur le terminal CB (Stripe/SumUp), puis confirme ici.</p>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={cbConfirmed}
                    onChange={(e) => setCbConfirmed(e.target.checked)}
                  />
                  Paiement CB confirme sur le terminal
                </label>
              </div>
            )}

            {paymentMethod === "qr" && total > 0 && (
              <div className="qr-block">
                <p>Le client scanne pour payer {total.toFixed(2)} EUR</p>
                <QRCodeSVG value={`CREPESFEST-PAY:${total.toFixed(2)}EUR`} size={140} />
                <p className="hint">
                  A brancher sur un vrai lien de paiement mobile (Lydia, Sumup Pay by Link...)
                </p>
              </div>
            )}
          </div>

          {error && <div className="error">{error}</div>}

          <button
            className="submit"
            disabled={cartLines.length === 0 || submitting}
            onClick={submitOrder}
          >
            {submitting ? "Envoi..." : "Valider la commande"}
          </button>

          {lastOrder && (
            <div className="last-order">
              Commande #{lastOrder.number} envoyee en cuisine ({lastOrder.total.toFixed(2)} EUR)
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
