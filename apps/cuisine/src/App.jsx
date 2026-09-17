import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { API_URL } from "./config.js";

const COLUMNS = [
  { status: "nouvelle", label: "Nouvelle" },
  { status: "en_preparation", label: "En preparation" },
  { status: "prete", label: "Prete" }
];

function CardContent({ order }) {
  return (
    <>
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
    </>
  );
}

export default function App() {
  const [orders, setOrders] = useState([]);
  const [connected, setConnected] = useState(false);
  const [drag, setDrag] = useState(null);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000 * 15);
    return () => clearInterval(t);
  }, []);

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
    socket.on("settings:update", (s) => {
      document.documentElement.dataset.theme = s.theme || "neo";
    });
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

  const draggedOrder = drag ? orders.find((o) => o.id === drag.id) : null;

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
    if (isDisplayOnly || drag) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      id: order.id,
      status: order.status,
      x: e.clientX,
      y: e.clientY,
      overStatus: order.status
    });
  }

  function handlePointerMove(e, order) {
    if (!drag || drag.id !== order.id) return;
    e.preventDefault();
    const overStatus = targetStatusAt(e.clientX, e.clientY);
    setDrag((d) => (d && d.id === order.id ? { ...d, x: e.clientX, y: e.clientY, overStatus } : d));
  }

  function endDrag(e, order) {
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
        <div className="title-left">
          <span className="title-icon">🍽️</span>
          <h1>CrepesFest - Cuisine{isDisplayOnly ? " (affichage)" : ""}</h1>
        </div>
        <div className="title-right">
          <span className={connected ? "status ok" : "status ko"}>
            {connected ? "Connecte" : "Deconnecte"}
          </span>
          <div className="title-controls">
            <span className="win-btn min">_</span>
            <span className="win-btn max">□</span>
            <span className="win-btn close">×</span>
          </div>
        </div>
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
                    className={`card${isDragging ? " drag-source" : ""}`}
                    onPointerDown={(e) => handlePointerDown(e, order)}
                    onPointerMove={(e) => handlePointerMove(e, order)}
                    onPointerUp={(e) => endDrag(e, order)}
                    onPointerCancel={(e) => endDrag(e, order)}
                  >
                    <CardContent order={order} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {drag && draggedOrder && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          <CardContent order={draggedOrder} />
        </div>
      )}

      <footer className="taskbar">
        <button className="start-btn">
          <span className="start-flag">⊞</span> Demarrer
        </button>
        <div className="taskbar-sep" />
        <div className="taskbar-item active">CrepesFest - Cuisine</div>
        <div className="taskbar-clock">
          {clock.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </footer>
    </div>
  );
}
