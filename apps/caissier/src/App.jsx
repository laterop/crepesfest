import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { API_URL } from "./config.js";

const PAYMENT_METHODS = [
  { id: "especes", label: "Especes" },
  { id: "cb", label: "Carte" },
  { id: "qr", label: "QR / mobile" }
];

const METHOD_LABEL = { especes: "Especes", cb: "Carte", qr: "QR" };

// Saisie "caisse enregistreuse" : sans point, les chiffres tapes remplissent
// depuis la droite (les 2 derniers = centimes), comme une calculette de caisse.
// Ex: "5" -> 0,05 EUR, "105" -> 1,05 EUR, "1050" -> 10,50 EUR.
// Si on tape un point, ou si la valeur est injectee via un bouton rapide, on
// reste en saisie decimale classique.
function cashValue(raw) {
  if (raw === "") return 0;
  if (raw.includes(".")) {
    const v = parseFloat(raw);
    return Number.isNaN(v) ? 0 : v;
  }
  const cents = parseInt(raw, 10);
  return Number.isNaN(cents) ? 0 : cents / 100;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function NumPad({ raw, onChange, numpadMode }) {
  function press(key) {
    onChange((prev) => {
      if (key === "back") return prev.slice(0, -1);
      if (key === "clear") return "";
      if (key === ".") return prev.includes(".") ? prev : prev + ".";
      return prev + key;
    });
  }

  const value = cashValue(raw);

  if (!numpadMode) {
    return (
      <input
        className="amount-input"
        type="number"
        inputMode="decimal"
        min="0"
        step="0.5"
        value={raw}
        onChange={(e) => onChange(() => e.target.value)}
      />
    );
  }

  return (
    <div className="numpad-wrap">
      <div className="amount-display">
        <span className="amount-value">{value.toFixed(2)} EUR</span>
        {raw !== "" && <span className="amount-raw">saisi : {raw}</span>}
      </div>
      <div className="keypad">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "back"].map((k) => (
          <button
            key={k}
            type="button"
            className={k === "back" ? "keypad-btn back" : "keypad-btn"}
            onClick={() => press(k)}
          >
            {k === "back" ? "⌫" : k}
          </button>
        ))}
      </div>
      <button type="button" className="keypad-clear" onClick={() => press("clear")}>
        Effacer
      </button>
    </div>
  );
}

export default function App() {
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState({}); // menuItemId -> qty
  const [customerName, setCustomerName] = useState("");
  const [numpadMode, setNumpadMode] = useState(true);

  // Paiements deja ajoutes a la commande en cours (permet de separer le
  // montant sur plusieurs modes, ou plusieurs personnes).
  const [payments, setPayments] = useState([]);

  // Formulaire d'ajout d'un paiement.
  const [entryMethod, setEntryMethod] = useState("especes");
  const [entryAmountRaw, setEntryAmountRaw] = useState("");
  const [entryCashReceived, setEntryCashReceived] = useState(null); // number | null
  const [entryCbConfirmed, setEntryCbConfirmed] = useState(false);

  const [lastOrder, setLastOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
    () => round2(cartLines.reduce((sum, l) => sum + l.price * l.qty, 0)),
    [cartLines]
  );

  const paidSoFar = useMemo(() => round2(payments.reduce((sum, p) => sum + p.amount, 0)), [payments]);
  const remaining = useMemo(() => Math.max(0, round2(total - paidSoFar)), [total, paidSoFar]);
  const fullyPaid = total > 0 && remaining <= 0.001;

  const entryAmount = cashValue(entryAmountRaw);
  const entryChange =
    entryMethod === "especes" && entryCashReceived != null
      ? Math.max(0, round2(entryCashReceived - entryAmount))
      : null;

  function addToCart(id) {
    setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  }

  function decFromCart(id) {
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) - 1) }));
  }

  function resetPaymentEntry(nextRemaining) {
    setEntryAmountRaw(nextRemaining > 0 ? nextRemaining.toFixed(2) : "");
    setEntryCashReceived(null);
    setEntryCbConfirmed(false);
  }

  function resetOrder() {
    setCart({});
    setCustomerName("");
    setPayments([]);
    setEntryMethod("especes");
    resetPaymentEntry(0);
  }

  function setQuickAmount(value) {
    setEntryAmountRaw(round2(value).toFixed(2));
    setEntryCashReceived(null);
  }

  function addPayment() {
    setError("");
    if (entryAmount <= 0) {
      setError("Indique un montant pour cette part");
      return;
    }
    if (entryAmount > remaining + 0.01) {
      setError(`Cette part depasse le reste a payer (${remaining.toFixed(2)} EUR)`);
      return;
    }
    if (entryMethod === "cb" && !entryCbConfirmed) {
      setError("Confirme le paiement CB sur le terminal avant d'ajouter cette part");
      return;
    }

    const part = { id: `${Date.now()}-${Math.random()}`, method: entryMethod, amount: round2(entryAmount) };
    if (entryMethod === "especes") {
      const received = entryCashReceived ?? entryAmount;
      part.cashReceived = received;
      part.change = Math.max(0, round2(received - entryAmount));
    }

    const nextRemaining = Math.max(0, round2(remaining - part.amount));
    setPayments((p) => [...p, part]);
    resetPaymentEntry(nextRemaining);
  }

  function removePayment(id) {
    setPayments((p) => {
      const next = p.filter((x) => x.id !== id);
      const nextPaid = round2(next.reduce((sum, x) => sum + x.amount, 0));
      resetPaymentEntry(Math.max(0, round2(total - nextPaid)));
      return next;
    });
  }

  async function submitOrder() {
    if (cartLines.length === 0 || !fullyPaid) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartLines.map((l) => ({ menuItemId: l.id, qty: l.qty })),
          payments: payments.map((p) => ({
            method: p.method,
            amount: p.amount,
            cashReceived: p.cashReceived
          })),
          customerName
        })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Echec de la commande");
      }
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
          <div className="panel-card">
            <h2 className="panel-title">Commande</h2>
            <input
              className="customer-input"
              placeholder="Nom du client (optionnel)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />

            <ul className="cart-lines">
              {cartLines.length === 0 && <li className="empty">Panier vide, touche un produit a gauche</li>}
              {cartLines.map((l) => (
                <li key={l.id} className="cart-line">
                  <span className="cart-line-name">{l.name}</span>
                  <div className="qty-controls">
                    <button onClick={() => decFromCart(l.id)}>-</button>
                    <span>{l.qty}</span>
                    <button onClick={() => addToCart(l.id)}>+</button>
                  </div>
                  <span className="line-total">{(l.price * l.qty).toFixed(2)} EUR</span>
                </li>
              ))}
            </ul>

            <div className="total-row">
              <span>Total</span>
              <span className="total-value">{total.toFixed(2)} EUR</span>
            </div>
          </div>

          <div className="panel-card payment-card">
            <h2 className="panel-title">Paiement</h2>

            <div className={`remaining-banner ${fullyPaid && total > 0 ? "paid" : ""}`}>
              {total === 0
                ? "Ajoute des produits pour commencer"
                : fullyPaid
                ? "Commande entierement reglee"
                : `Reste a encaisser : ${remaining.toFixed(2)} EUR`}
            </div>

            {payments.length > 0 && (
              <ul className="payment-list">
                {payments.map((p) => (
                  <li key={p.id} className="payment-chip">
                    <span className="chip-method">{METHOD_LABEL[p.method]}</span>
                    <span className="chip-amount">{p.amount.toFixed(2)} EUR</span>
                    {p.method === "especes" && p.change > 0 && (
                      <span className="chip-change">rendu {p.change.toFixed(2)} EUR</span>
                    )}
                    <button type="button" className="chip-remove" onClick={() => removePayment(p.id)}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!fullyPaid && total > 0 && (
              <div className="payment-entry">
                <div className="entry-header">
                  <span className="entry-title">Ajouter un paiement</span>
                  <button
                    type="button"
                    className="mode-toggle"
                    onClick={() => setNumpadMode((m) => !m)}
                  >
                    {numpadMode ? "clavier" : "pave numerique"}
                  </button>
                </div>

                <div className="quick-amounts">
                  <button type="button" onClick={() => setQuickAmount(remaining)}>
                    Tout le reste ({remaining.toFixed(2)} EUR)
                  </button>
                  {[2, 3, 4].map((n) => (
                    <button key={n} type="button" onClick={() => setQuickAmount(remaining / n)}>
                      ÷{n}
                    </button>
                  ))}
                </div>

                <NumPad raw={entryAmountRaw} onChange={setEntryAmountRaw} numpadMode={numpadMode} />

                <div className="method-select">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={entryMethod === m.id ? "active" : ""}
                      onClick={() => {
                        setEntryMethod(m.id);
                        setEntryCbConfirmed(false);
                        setEntryCashReceived(null);
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {entryMethod === "especes" && (
                  <div className="cash-received-row">
                    <span className="cash-received-label">Espece recu si different du montant :</span>
                    <div className="bill-buttons">
                      {[5, 10, 20, 50].map((bill) => (
                        <button
                          key={bill}
                          type="button"
                          disabled={bill < entryAmount}
                          onClick={() => setEntryCashReceived(bill)}
                        >
                          {bill} EUR
                        </button>
                      ))}
                      <button type="button" onClick={() => setEntryCashReceived(null)}>
                        Exact
                      </button>
                    </div>
                    {entryChange !== null && entryChange > 0 && (
                      <div className="change">Monnaie a rendre : {entryChange.toFixed(2)} EUR</div>
                    )}
                  </div>
                )}

                {entryMethod === "cb" && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={entryCbConfirmed}
                      onChange={(e) => setEntryCbConfirmed(e.target.checked)}
                    />
                    Paiement CB confirme sur le terminal
                  </label>
                )}

                {entryMethod === "qr" && entryAmount > 0 && (
                  <div className="qr-block">
                    <p>Le client scanne pour payer {entryAmount.toFixed(2)} EUR</p>
                    <QRCodeSVG value={`CREPESFEST-PAY:${entryAmount.toFixed(2)}EUR`} size={120} />
                  </div>
                )}

                <button type="button" className="add-payment" onClick={addPayment}>
                  Ajouter cette part
                </button>
              </div>
            )}

            {error && <div className="error">{error}</div>}

            <button
              className="submit"
              disabled={cartLines.length === 0 || !fullyPaid || submitting}
              onClick={submitOrder}
            >
              {submitting ? "Envoi..." : "Valider la commande"}
            </button>

            {lastOrder && (
              <div className="last-order">
                Commande #{lastOrder.number} envoyee en cuisine ({lastOrder.total.toFixed(2)} EUR)
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
