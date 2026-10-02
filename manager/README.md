# Protect Gestion

Ce bot Discord séparé crée des locations de bots personnels avec une copie du code Protect présent sur l’hébergement. Le gestionnaire et les copies tournent comme processus Node sur le même hébergement. Aucune API Pterodactyl n’est nécessaire.

## Installation

1. Crée une **nouvelle application Discord et son bot** pour le gestionnaire. Active **Message Content Intent** pour ce bot. Son token doit être différent de celui de ton Protect principal. Invite le gestionnaire sur un serveur partagé avec tes clients, avec les permissions de voir les salons, envoyer des messages et intégrer des liens, afin de pouvoir leur envoyer les formulaires en MP.
2. Copie `manager/config.example.json` vers `manager/config.json`. Renseigne le token du gestionnaire et ton `ownerId`. Si `ownerId` est vide, le gestionnaire utilise le premier owner du `config.json` principal. `maxBots` limite les locations actives et les invitations en cours ; adapte-le à la RAM et au CPU disponibles.
3. Installe les dépendances du projet (`npm ci`). Node **22.12 ou supérieur** est requis.
4. Lance **`node index.js`** (ou `npm start`) pour démarrer Protect et le gestionnaire ensemble, avec ton démarrage Pterodactyl habituel. Pour le gestionnaire seul : **`node manager/index.js`** ou **`npm run start:manager`**.

Le démarrage alternatif **`node manager/with-main.js`** ou **`npm run start:both`** reste disponible et ne lance pas de gestionnaire en double. Le `config.json` principal conserve le token de Protect ; `manager/config.json` contient celui du gestionnaire. Si le gestionnaire ne peut pas se connecter, son erreur est affichée dans le terminal et Protect principal continue. Les copies clientes ne lancent jamais de gestionnaire. Aucun bot n’est lancé automatiquement depuis Codex : ces commandes sont à exécuter sur ton hébergement.

Sans token gestionnaire ou avec un JSON invalide, le démarrage automatique affiche le problème et garde Protect seul, sans créer de second processus. Si l’hébergement refuse la création du processus, Protect continue également. Une limite de RAM ou de processus imposée par l’hébergeur reste à vérifier dans sa console avant d’activer plusieurs bots.

Alternativement, `PROTECT_MANAGER_TOKEN` et `PROTECT_MANAGER_OWNER` remplacent le token et l’owner de la configuration. Ne mets pas le token du gestionnaire dans `DISCORD_TOKEN` : cette variable reste réservée au Protect principal lorsque tu lances les deux.

## Commandes du gestionnaire

- **`+create @client 30j`** : réservé uniquement à l’ID propriétaire du gestionnaire. Envoie au client un MP avec un bouton de configuration. Il peut fournir le token de **son bot Discord** et l’owner ID dans un formulaire, sans publier son token dans un message. Le formulaire est réservé au client, utilisable une fois et expire après 24 heures. La durée commence après validation et lancement, pas à l’envoi de l’invitation.
- **`+mybot`** : montre les bots du client, leurs IDs de location, leur état, les échéances et les invitations avec commandes slash. Le propriétaire du gestionnaire peut voir toutes les locations et filtrer avec `+mybot @client` ou `+mybot <ID location>`. Aucun token n’est affiché.
- **`+renew <ID location> 30j`** : réservé au propriétaire du gestionnaire. Ajoute une durée à une location active. Pour une location expirée, repart de maintenant et relance le bot avec ses données conservées. `+renew @client 30j` fonctionne si ce client ne possède qu’une location. Une invitation encore en attente gagne du temps de location ; une invitation expirée doit être recréée.
- **`!help`** ou **`+help`** : affiche le menu en embed du gestionnaire. Les commandes create et renew sont affichées uniquement à son propriétaire. Le préfixe des autres commandes reste celui de la configuration (`+` par défaut).

Durées : `30m`, `2h`, `7j`, `30j`, `365j` (minimum une minute ; maximum 365 jours par commande).

Le client doit activer **Server Members Intent**, **Message Content Intent** et **Presence Intent** pour son application : la source Protect utilise ces intents. Il doit inviter **son bot** sur son serveur via l’invitation fournie après configuration ou dans `+mybot`. Le gestionnaire vérifie le token avec Discord et refuse les comptes non bots, son propre token, le token principal connu et les bots déjà loués.

## Durées, reprise et données

Le terminal affiche la connexion en cours, puis `🟢 Protect Gestion : EN LIGNE sur Discord` après connexion. Chaque bot client affiche aussi son démarrage, sa connexion Discord confirmée et `🔴 HORS LIGNE` lorsqu’il s’arrête, avec la raison (expiration, arrêt du gestionnaire ou arrêt du processus). Les tokens ne sont jamais affichés dans ces lignes.

Un contrôle toutes les 15 secondes arrête les copies arrivées à échéance et tente d’envoyer un MP au client. Les bots actifs reprennent après redémarrage du gestionnaire. À sa fermeture, les processus clients sont arrêtés ; les copies s’arrêtent également si leur connexion au gestionnaire est perdue. Après trois échecs de lancement, la relance automatique est suspendue ; vérifie le token et les intents avant un renouvellement.

Les copies sont dans `manager/runtime/instances/<ID location>/`. Elles ont leurs propres owners, configuration et dossier `data/`. Elles ne reçoivent ni le Git, ni les données, ni les tokens, ni les clés Google/Twitch du Protect principal. Elles utilisent les dépendances installées dans le `node_modules` du projet parent. Elles conservent la version du code copiée à leur création ; leur commande `updatebot` est bloquée pour protéger le dépôt parent. Le Protect principal peut continuer à utiliser `updatebot`.

Les fichiers statiques `data/changelogs.json`, `data/lang/fr.json` et `data/lang/en.json` font partie de chaque copie. Au lancement, les fichiers manquants sont restaurés, même pour une ancienne instance déjà marquée prête. Les locations en échec avec ces fichiers manquants sont réparées et autorisées à redémarrer si elles n’ont pas expiré. Les données personnelles présentes sont conservées.

Les tokens clients sont chiffrés avec AES-256-GCM dans `manager/runtime/rentals.json` et passés seulement à l’environnement du processus client. La clé est `manager/runtime/tokens.key`. **Conserve tout le dossier `manager/runtime` lors des mises à jour ou transferts d’hébergement**, y compris la clé ; sans elle, les anciens tokens ne peuvent plus être lus. La configuration du gestionnaire et son runtime sont ignorés par Git. Le fournisseur d’hébergement et les personnes ayant accès aux fichiers ou aux processus doivent rester des personnes de confiance : les processus partagent le même compte système.

La location n’efface pas les données à l’expiration, afin de permettre un renouvellement. Il n’y a pas de paiement automatique, de création d’applications Discord ou de provisionnement de nouveaux conteneurs : le client apporte son application et son token, et les ressources viennent de ton hébergement.
