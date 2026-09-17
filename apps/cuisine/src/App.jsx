import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { API_URL } from "./config.js";

const COLUMNS = [
  { status: "nouvelle", label: "Nouvelle" },
  { status: "en_preparation", label: "En preparation" },
  { status: "prete", label: "Prete" }
];

export default function App() {
  const [orders, setOrders] = useState([]);
  const [connected, setConnected] = useState(false);
  const [drag, setDrag] = useState(null);

  // Le grand ecran cuisine (affichage pur, TV au mur par exemple) n'a souvent
  // aucune interaction possible. On ouvre alors cette URL avec ?affichage=1 :
  // c'est un affichage sans interaction. L'ecran de la station de garnissage,
  // lui, est tactile : on ouvre la meme page SANS le parametre, et on
  // deplace les commandes a la main (glisser-deposer) d'une colonne a l'autre.
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

  function targetStatusAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const colEl = el && el.closest("[data-status-col]");
    return colEl ? colEl.getAttribute("data-status-col") : null;
  }

  function handlePointerDown(e, order) {
    if (isDisplayOnly) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      id: order.id,
      status: order.status,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      overStatus: null
    });
  }

  function handlePointerMove(e, order) {
    if (!drag || drag.id !== order.id) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const overStatus = targetStatusAt(e.clientX, e.clientY);
    setDrag((d) => (d && d.id === order.id ? { ...d, dx, dy, overStatus } : d));
  }

  function handlePointerUp(e, order) {
    if (!drag || drag.id !== order.id) return;
    const newStatus = targetStatusAt(e.clientX, e.clientY);
    if (newStatus && newStatus !== order.status) {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o)));
      updateStatus(order.id, newStatus);
    }
    setDrag(null);
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>CrepesFest - Cuisine{isDisplayOnly ? " (affichage)" : ""}</h1>
        <span className={connected ? "status ok" : "status ko"}>
          {connected ? "Connecte" : "Deconnecte"}
        </span>
      </header>

      {!isDisplayOnly && (
        <p className="hint">Attrape une commande et fais-la glisser dans la bonne colonne</p>
      )}

      <div className="board">
        {COLUMNS.map((col) => (
          <div
            key={col.status}
            className={`column${drag && drag.overStatus === col.status ? " drag-target" : ""}`}
            data-status-col={col.status}
          >
            <h2>
              {col.label} <span className="count">{byStatus[col.status]?.length || 0}</span>
            </h2>
            <div className="cards">
              {byStatus[col.status]?.map((order) => {
                const isDragging = drag && drag.id === order.id;
                return (
                  <div
                    key={order.id}
                    className={`card${isDragging ? " dragging" : ""}`}
                    style={
                      isDragging
                        ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` }
                        : undefined
                    }
                    onPointerDown={(e) => handlePointerDown(e, order)}
                    onPointerMove={(e) => handlePointerMove(e, order)}
                    onPointerUp={(e) => handlePointerUp(e, order)}
                    onPointerCancel={() => setDrag(null)}
                  >
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
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
