import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { API_URL } from "./config.js";

const COLUMNS = [
  { status: "nouvelle", label: "Nouvelle", next: "en_preparation", nextLabel: "Prendre en prepa" },
  { status: "en_preparation", label: "En preparation", next: "prete", nextLabel: "Marquer prete" },
  { status: "prete", label: "Prete", next: "servie", nextLabel: "Marquer servie" }
];

export default function App() {
  const [orders, setOrders] = useState([]);
  const [connected, setConnected] = useState(false);

  // Le grand ecran cuisine n'a souvent aucune interaction possible (pas de
  // souris, pas de tactile). On ouvre alors cette URL avec ?affichage=1 :
  // c'est un affichage pur, sans bouton. Le controle des statuts se fait
  // depuis un autre appareil (le telephone de la personne en cuisine) qui
  // ouvre la meme page SANS le parametre.
  const isDisplayOnly = new URLSearchParams(window.location.search).get("affichage") === "1";

  useEffect(() => {
    const socket = io(API_URL);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("orders:update", (data) => setOrders(data));
    return () => socket.disconnect();
  }, []);

  const byStatus = useMemo(() => {
    const map = {};
    for (const col of COLUMNS) map[col.status] = [];
    for (const o of orders) {
      if (map[o.status]) map[o.status].push(o);
    }
    return map;
  }, [orders]);

  async function updateStatus(id, status) {
    await fetch(`${API_URL}/api/orders/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>CrepesFest - Cuisine{isDisplayOnly ? " (affichage)" : ""}</h1>
        <span className={connected ? "status ok" : "status ko"}>
          {connected ? "Connecte" : "Deconnecte"}
        </span>
      </header>

      <div className="board">
        {COLUMNS.map((col) => (
          <div key={col.status} className="column">
            <h2>
              {col.label} <span className="count">{byStatus[col.status]?.length || 0}</span>
            </h2>
            <div className="cards">
              {byStatus[col.status]?.map((order) => (
                <div key={order.id} className="card">
                  <div className="card-header">
                    <span className="number">#{order.number}</span>
                    {order.customerName && <span className="customer">{order.customerName}</span>}
                  </div>
                  <ul>
                    {order.items.map((it, idx) => (
                      <li key={idx}>
                        {it.qty} x {it.name}
                      </li>
                    ))}
                  </ul>
                  <div className="card-footer">
                    <span className="time">
                      {new Date(order.createdAt).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                    {!isDisplayOnly && (
                      <button onClick={() => updateStatus(order.id, col.next)}>{col.nextLabel}</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
