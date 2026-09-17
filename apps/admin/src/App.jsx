import { useEffect, useState } from "react";
import { API_URL } from "./config.js";

const TABS = ["menu", "commandes", "stats", "caisse"];

export default function App() {
  const [tab, setTab] = useState("menu");
  const [menu, setMenu] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState({ fondDeCaisse: 0 });
  const [fondDeCaisseInput, setFondDeCaisseInput] = useState("0");
  const [clotures, setClotures] = useState([]);
  const [clotureBusy, setClotureBusy] = useState(false);
  const [clotureError, setClotureError] = useState("");
  const [newItem, setNewItem] = useState({ name: "", price: "", category: "sucree", color: "#e0c9a6" });

  function loadMenu() {
    fetch(`${API_URL}/api/menu`).then((r) => r.json()).then(setMenu);
  }
  function loadOrders() {
    fetch(`${API_URL}/api/orders`).then((r) => r.json()).then(setOrders);
  }
  function loadStats() {
    fetch(`${API_URL}/api/stats`).then((r) => r.json()).then(setStats);
  }
  function loadSettings() {
    fetch(`${API_URL}/api/settings`)
      .then((r) => r.json())
      .then((s) => {
        setSettings(s);
        setFondDeCaisseInput(String(s.fondDeCaisse ?? 0));
      });
  }
  function loadClotures() {
    fetch(`${API_URL}/api/clotures`).then((r) => r.json()).then(setClotures);
  }

  useEffect(() => {
    loadMenu();
    loadOrders();
    loadStats();
    loadSettings();
    loadClotures();
    const interval = setInterval(() => {
      loadOrders();
      loadStats();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function addItem() {
    if (!newItem.name || !newItem.price) return;
    await fetch(`${API_URL}/api/menu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newItem, price: Number(newItem.price) })
    });
    setNewItem({ name: "", price: "", category: "sucree", color: "#e0c9a6" });
    loadMenu();
  }

  async function updateItem(id, patch) {
    await fetch(`${API_URL}/api/menu/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    loadMenu();
  }

  async function deleteItem(id) {
    await fetch(`${API_URL}/api/menu/${id}`, { method: "DELETE" });
    loadMenu();
  }

  async function saveFondDeCaisse() {
    await fetch(`${API_URL}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fondDeCaisse: Number(fondDeCaisseInput || 0) })
    });
    loadSettings();
  }

  async function cloturer() {
    if (!window.confirm("Cloturer la journee ? Les commandes en cours seront archivees et les compteurs remis a zero.")) {
      return;
    }
    setClotureBusy(true);
    setClotureError("");
    try {
      const res = await fetch(`${API_URL}/api/cloture`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Echec de la cloture");
      }
      await res.json();
      loadOrders();
      loadStats();
      loadClotures();
    } catch (e) {
      setClotureError(e.message);
    } finally {
      setClotureBusy(false);
    }
  }

  const maxQty = stats ? Math.max(1, ...stats.topProduits.map((p) => p.qty)) : 1;
  const maxPaiement = stats ? Math.max(1, ...Object.values(stats.parPaiement)) : 1;

  return (
    <div className="app">
      <header className="topbar">
        <h1>CrepesFest - Gestion</h1>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      {tab === "menu" && (
        <section className="panel">
          <h2>Produits</h2>
          <table>
            <thead>
              <tr>
                <th>Couleur</th>
                <th>Nom</th>
                <th>Prix</th>
                <th>Categorie</th>
                <th>Dispo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {menu.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="color"
                      className="color-input"
                      defaultValue={item.color || "#e0c9a6"}
                      onBlur={(e) => updateItem(item.id, { color: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      defaultValue={item.name}
                      onBlur={(e) => updateItem(item.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      defaultValue={item.price}
                      onBlur={(e) => updateItem(item.id, { price: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      defaultValue={item.category}
                      onBlur={(e) => updateItem(item.id, { category: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={item.available}
                      onChange={(e) => updateItem(item.id, { available: e.target.checked })}
                    />
                  </td>
                  <td>
                    <button className="danger" onClick={() => deleteItem(item.id)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Ajouter un produit</h3>
          <div className="new-item">
            <input
              type="color"
              className="color-input"
              value={newItem.color}
              onChange={(e) => setNewItem({ ...newItem, color: e.target.value })}
            />
            <input
              placeholder="Nom"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
            />
            <input
              placeholder="Prix"
              type="number"
              step="0.1"
              value={newItem.price}
              onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
            />
            <input
              placeholder="Categorie"
              value={newItem.category}
              onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
            />
            <button onClick={addItem}>Ajouter</button>
          </div>
        </section>
      )}

      {tab === "commandes" && (
        <section className="panel">
          <h2>Historique des commandes</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Client</th>
                <th>Articles</th>
                <th>Total</th>
                <th>Paiement</th>
                <th>Statut</th>
                <th>Heure</th>
              </tr>
            </thead>
            <tbody>
              {[...orders].reverse().map((o) => (
                <tr key={o.id}>
                  <td>{o.number}</td>
                  <td>{o.customerName || "-"}</td>
                  <td>{o.items.map((it) => `${it.qty}x ${it.name}`).join(", ")}</td>
                  <td>{o.total.toFixed(2)} EUR</td>
                  <td>
                    {(o.payments || (o.payment ? [{ method: o.payment.method, amount: o.total }] : []))
                      .map((p) => `${p.method} ${p.amount.toFixed(2)}€`)
                      .join(" + ")}
                  </td>
                  <td>{o.status}</td>
                  <td>{new Date(o.createdAt).toLocaleTimeString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "stats" && stats && (
        <section className="panel">
          <h2>Statistiques</h2>
          <div className="stat-cards">
            <div className="stat-card">
              <div className="value">{stats.totalVentes.toFixed(2)} EUR</div>
              <div className="label">Chiffre d'affaires</div>
            </div>
            <div className="stat-card">
              <div className="value">{stats.nbCommandes}</div>
              <div className="label">Commandes</div>
            </div>
            <div className="stat-card">
              <div className="value">{stats.panierMoyen.toFixed(2)} EUR</div>
              <div className="label">Panier moyen</div>
            </div>
          </div>

          <h3>Top produits</h3>
          <div className="bars">
            {stats.topProduits.map((p) => (
              <div className="bar-row" key={p.name}>
                <span className="bar-label">{p.name}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(p.qty / maxQty) * 100}%` }} />
                </div>
                <span className="bar-value">{p.qty}</span>
              </div>
            ))}
          </div>

          <h3>Repartition par mode de paiement</h3>
          <div className="bars">
            {Object.entries(stats.parPaiement).map(([method, montant]) => (
              <div className="bar-row" key={method}>
                <span className="bar-label">{method}</span>
                <div className="bar-track">
                  <div className="bar-fill alt" style={{ width: `${(montant / maxPaiement) * 100}%` }} />
                </div>
                <span className="bar-value">{montant.toFixed(2)} EUR</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "caisse" && (
        <section className="panel">
          <h2>Fond de caisse</h2>
          <p className="hint-text">
            Le montant d'especes que t'as mis dans la caisse au debut de la journee, pour rendre la monnaie.
          </p>
          <div className="fond-row">
            <input
              type="number"
              step="1"
              value={fondDeCaisseInput}
              onChange={(e) => setFondDeCaisseInput(e.target.value)}
            />
            <span>EUR</span>
            <button onClick={saveFondDeCaisse}>Enregistrer</button>
          </div>
          <div className="current-value">Fond de caisse actuel : {Number(settings.fondDeCaisse || 0).toFixed(2)} EUR</div>

          <h2>Cloture de journee (ticket Z)</h2>
          <p className="hint-text">
            Ferme la journee en cours : archive toutes les commandes, remet les compteurs a zero pour
            demain, et garde un recap definitif ci-dessous.
          </p>
          <button className="cloture-btn" onClick={cloturer} disabled={clotureBusy}>
            {clotureBusy ? "Cloture en cours..." : "Cloturer la journee"}
          </button>
          {clotureError && <div className="error-text">{clotureError}</div>}

          <h3>Historique des clotures</h3>
          {clotures.length === 0 && <p className="hint-text">Aucune cloture pour le moment.</p>}
          <div className="clotures-list">
            {clotures.map((c) => (
              <div key={c.id} className="cloture-card">
                <div className="cloture-header">
                  <span className="cloture-date">
                    {new Date(c.date).toLocaleString("fr-FR")}
                  </span>
                  <span className="cloture-total">{c.totalVentes.toFixed(2)} EUR</span>
                </div>
                <div className="cloture-details">
                  <span>{c.nbCommandes} commandes</span>
                  <span>panier moyen {c.panierMoyen.toFixed(2)} EUR</span>
                  <span>fond de caisse {c.fondDeCaisse.toFixed(2)} EUR</span>
                  <span className="highlight">especes attendues en caisse : {c.especesAttendues.toFixed(2)} EUR</span>
                </div>
                <div className="cloture-payments">
                  {Object.entries(c.parPaiement).map(([m, montant]) => (
                    <span key={m} className="cloture-chip">
                      {m} : {montant.toFixed(2)} EUR
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
