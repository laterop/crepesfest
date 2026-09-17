import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "data.json");
const adapter = new JSONFile(file);

const defaultData = {
  menu: [
    { id: "crepe-nutella", name: "Crepe Nutella", price: 4.5, category: "sucree", available: true, color: "#f2b8c6" },
    { id: "crepe-sucre", name: "Crepe sucre", price: 3, category: "sucree", available: true, color: "#f2b8c6" },
    { id: "crepe-citron", name: "Crepe citron", price: 3, category: "sucree", available: true, color: "#f2b8c6" },
    { id: "crepe-caramel", name: "Crepe caramel beurre sale", price: 4.5, category: "sucree", available: true, color: "#f2b8c6" },
    { id: "galette-jambon-fromage", name: "Galette jambon fromage", price: 6.5, category: "salee", available: true, color: "#bfe0c4" },
    { id: "galette-fromage", name: "Galette fromage", price: 5.5, category: "salee", available: true, color: "#bfe0c4" },
    { id: "boisson-eau", name: "Eau", price: 1.5, category: "boisson", available: true, color: "#b8d4f2" },
    { id: "boisson-soda", name: "Soda", price: 2.5, category: "boisson", available: true, color: "#b8d4f2" }
  ],
  categoryColors: { sucree: "#f2b8c6", salee: "#bfe0c4", boisson: "#b8d4f2" },
  orders: [],
  counter: 0,
  settings: { fondDeCaisse: 0, theme: "neo" },
  clotures: []
};

export const db = new Low(adapter, defaultData);

export async function initDb() {
  await db.read();
  db.data ||= structuredClone(defaultData);

  // Migration douce : completer les champs ajoutes apres la premiere mise en prod,
  // sans ecraser les donnees deja presentes (menu, commandes...).
  db.data.categoryColors ||= structuredClone(defaultData.categoryColors);
  db.data.settings ||= structuredClone(defaultData.settings);
  db.data.settings.theme ||= "neo";
  db.data.clotures ||= [];
  for (const item of db.data.menu) {
    if (!item.color) {
      item.color = db.data.categoryColors[item.category] || "#e0c9a6";
    }
  }
  for (const order of db.data.orders) {
    if (order.archived == null) order.archived = false;
  }

  await db.write();
}
