# CrepesFest

Systeme de prise de commande et de paiement pour un stand de crepes (usage event ponctuel : festival, marche...).

## Structure

```
crepesfest/
  server/          API + temps reel (Node/Express + Socket.io), stockage JSON local (lowdb)
  apps/
    caissier/      Front caisse : prise de commande + paiement (especes / CB / QR)
    cuisine/       Front cuisine : file d'attente des commandes en temps reel
    admin/         Back gestion : menu, historique commandes, statistiques de vente
```

Les 3 fronts sont des apps React/Vite independantes qui parlent toutes a la meme API.
Le serveur garde tout en memoire + un fichier `server/data.json` (cree automatiquement),
pas besoin d'installer de vraie base de donnees pour un usage event ponctuel.

## Installation

Dans chacun des 4 dossiers (`server`, `apps/caissier`, `apps/cuisine`, `apps/admin`) :

```
npm install
```

## Lancement (developpement)

Ouvrir 4 terminaux :

```
cd server && npm run dev          # API sur http://localhost:4000
cd apps/caissier && npm run dev   # Caisse sur http://localhost:5173
cd apps/cuisine && npm run dev    # Cuisine sur http://localhost:5174
cd apps/admin && npm run dev      # Gestion sur http://localhost:5175
```

Le jour J, il suffit d'ouvrir chaque URL sur l'appareil dedie (tablette caisse, ecran cuisine,
ton telephone/laptop pour la gestion) connecte au meme reseau Wifi. Si les appareils ne sont
pas sur la meme machine, remplace `localhost` par l'IP locale de la machine qui fait tourner
`server` (visible dans le terminal du serveur au lancement de `npm run dev` cote front, ligne
"Network"), et passe la variable d'environnement `VITE_API_URL` aux 3 fronts, ex :

```
VITE_API_URL=http://192.168.1.42:4000 npm run dev
```

## Build pour la mise en prod (event)

```
cd apps/caissier && npm run build   # genere apps/caissier/dist
cd apps/cuisine && npm run build
cd apps/admin && npm run build
```

Chaque `dist/` est un site statique servable avec n'importe quel serveur web (ou `npm run preview`).
Le serveur `server/` doit tourner en continu pendant l'evenement (ordi ou petit boitier/raspberry
branche sur le meme reseau que les tablettes).

## Paiement : etat actuel et pistes d'evolution

Le MVP gere 3 modes de paiement cote caisse :

- **Especes** : la caissiere saisit le montant recu, l'appli calcule la monnaie a rendre automatiquement.
- **Carte bancaire** : simulation d'une confirmation manuelle (case a cocher "paiement confirme sur le
  terminal"). A brancher plus tard sur un vrai terminal Stripe Terminal ou SumUp (leurs SDK exposent des
  evenements de paiement qu'on peut recuperer pour remplacer la case a cocher par une vraie confirmation
  automatique).
- **QR code** : un QR code est genere avec le montant, pense comme un point d'entree a relier a un vrai
  lien de paiement mobile (Lydia Pro, SumUp Pay by Link, Stripe Payment Links...). Aujourd'hui il n'encode
  qu'une reference de commande, pas un vrai lien de paiement.

## Impression cuisine

Pour l'instant, la cuisine fonctionne avec un ecran (tablette/laptop) qui affiche les commandes en
temps reel et permet de faire avancer leur statut (nouvelle -> en preparation -> prete -> servie).
Si une imprimante ticket thermique (ex: format 80mm, reseau ou USB) est ajoutee plus tard, il suffira
de brancher un petit service qui ecoute l'evenement socket `orders:new` cote serveur et envoie un
ticket a l'imprimante (la plupart des imprimantes de caisse acceptent des commandes ESC/POS via reseau).

## API principale

- `GET /api/menu` / `POST /api/menu` / `PUT /api/menu/:id` / `DELETE /api/menu/:id`
- `GET /api/orders` / `POST /api/orders` / `PATCH /api/orders/:id/status` / `PATCH /api/orders/:id/paiement`
- `GET /api/stats`
- Evenements Socket.io : `orders:new`, `orders:update`, `menu:update`
