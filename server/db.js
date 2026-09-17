import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "data.json");
const adapter = new JSONFile(file);

const defaultData = {
  menu: [
    { id: "crepe-nutella", name: "Crepe Nutella", price: 4.5, category: "sucree", available: true },
    { id: "crepe-sucre", name: "Crepe sucre", price: 3, category: "sucree", available: true },
    { id: "crepe-citron", name: "Crepe citron", price: 3, category: "sucree", available: true },
    { id: "crepe-caramel", name: "Crepe caramel beurre sale", price: 4.5, category: "sucree", available: true },
    { id: "galette-jambon-fromage", name: "Galette jambon fromage", price: 6.5, category: "salee", available: true },
    { id: "galette-fromage", name: "Galette fromage", price: 5.5, category: "salee", available: true },
    { id: "boisson-eau", name: "Eau", price: 1.5, category: "boisson", available: true },
    { id: "boisson-soda", name: "Soda", price: 2.5, category: "boisson", available: true }
  ],
  orders: [],
  counter: 0
};

export const db = new Low(adapter, defaultData);

export async function initDb() {
  await db.read();
  db.data ||= structuredClone(defaultData);
  await db.write();
}
