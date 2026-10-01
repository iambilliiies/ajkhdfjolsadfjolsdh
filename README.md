# Protect

La catégorie **Modération** est dans `commands/moderation/` et occupe une seule page du help. Les commandes sont réservées aux administrateurs, propriétaire du serveur et owners du bot. Les actions sur plusieurs membres affichent les réussites et échecs. Les membres protégés (propriétaire, owners, bot lui-même, auteur de la commande) et ceux au-dessus du bot ou du demandeur ne sont pas sanctionnés.

- Mentions/IDs : `+warn @Membre @Autre raison`, `+tempmute @Membre 10m raison`. Noms composés : `+warn Jean Dupont,,raison`, `+tempmute Jean Dupont,,Autre Nom,,10m,,raison`. Pour des actions sans raison, les noms/IDs sont séparés par `,,`. Pour éviter l’ambiguïté d’une raison identique au nom d’un membre, préfère les mentions.
- `+sanctions <membre>` affiche les entrées enregistrées depuis l’installation de ces fonctions, y compris les sanctions automod et antiraid. `+del sanction <membre> <numéro>`, `+clear sanctions <membre>` et `+clear all sanctions` suppriment l’historique après confirmation, sans retirer les sanctions actives. `+warn` enregistre un avertissement et écrit dans modlog ; il n’envoie pas de MP automatique.
- `+mute`, `+tempmute`, `+unmute` réutilisent le choix timeout/rôle muet. En mode timeout, un mute sans durée dure **28 jours**, limite Discord ; un mute permanent utilise le mode rôle muet. Les expirations de rôle sont gérées par le planificateur existant.
- `+cmute`, `+tempcmute` et `+uncmute` modifient les permissions personnelles du membre dans le salon textuel. Les permissions initiales sont sauvegardées et restaurées ; une permission modifiée entre-temps par un autre administrateur est conservée. `+mutelist` liste les timeouts, rôles muets et mutes de salon. `+unmuteall` demande confirmation.
- `+kick`, `+ban`, `+tempban`, `+unban` et `+banlist` gèrent les bannissements. Un ban temporaire est enregistré avant l’action, traité à son échéance ou au redémarrage, et retenté après une minute en cas d’échec. Un membre encore blacklisté n’est pas débanni. Un ban permanent ou un débannissement manuel annule l’échéance précédente.
- `+clear [nombre] [membre]` respecte `clear limit`, filtre éventuellement par membre et conserve les messages épinglés ou de plus de 14 jours. Avec un filtre, la recherche est limitée à 10 000 messages récents ; le résultat peut donc être inférieur au nombre demandé.
- `+lock`/`+unlock`, `+hide`/`+unhide` et leurs variantes `all` modifient les permissions de `@everyone` ainsi que les overwrites explicites existants de rôles et membres. Les changements globaux demandent confirmation. Les permissions initiales sont sauvegardées pour la réouverture et l’accès du bot est conservé. Le contournement Administrateur de Discord reste applicable ; de nouveaux overwrites ajoutés après le verrouillage peuvent aussi rendre un accès possible.
- `+addrole @Membre @Autre @Rôle @AutreRôle`, `+delrole` et la syntaxe `membres,,rôles` gèrent les rôles. `+derank` conserve les rôles configurés avec `noderank`, les rôles gérés et ceux que le bot ne peut pas retirer.

L’historique, les échéances de bans/mutes de salon et les sauvegardes de permissions sont dans `data/moderation-actions.json`. Les resets de paramètres conservent ces données pour ne pas abandonner des expirations ou perdre la restauration d’un salon ; utilise les commandes de suppression d’historique pour effacer les sanctions.

La catégorie **Paramètres de modération** est dans `commands/moderation-settings/` et occupe une page du help. Les réglages, strikes et réservations de sanctions sont sauvegardés par serveur dans `data/server-config.json`. Les protections sont désactivées par défaut ; les administrateurs, owners du bot, propriétaire du serveur et bots sont exemptés.

- `+antispam on` et `+antispam 5/5s` configurent les messages par utilisateur dans une fenêtre glissante. `+antilink on` puis `+antilink invite/all` bloquent les invitations ou liens. `+antimassmention on` puis `+antimassmention 5` comptent les mentions utilisateur, rôle, everyone et here dans un message, y compris les répétitions.
- `+badwords on`, `+badwords add mot,,phrase`, `+badwords del mot` et `+badwords list` utilisent des textes littéraux normalisés et sans distinction de casse, présents n’importe où dans le message. `+clear badwords` demande confirmation.
- `+spam allow/deny/reset [salon]` et `+link allow/deny/reset [salon]` autorisent, bloquent ou suivent le réglage global. `deny` active la protection dans ce salon même si elle est désactivée globalement. Plusieurs salons peuvent être séparés par `,,`.
- `+piconly add/del [salon]` exige uniquement des pièces jointes image, sans texte ni autre fichier. Les liens d’images, stickers et messages sans pièces jointes sont refusés. Le bot ne vérifie pas que l’image montre réellement un visage.
- `+strikes` affiche les déclencheurs `antispam`, `antilink`, `antimassmention`, `badwords` et `piconly`. `+strikes antilink 2 ancien` modifie les points. Par défaut chaque action vaut 1 point pour un ancien et 2 pour un nouveau ; `+ancien 7j` définit l’ancienneté. Plusieurs infractions dans un message cumulent leurs points. Un message signalé est supprimé et ses commandes ne sont pas exécutées, même si la suppression échoue faute de permissions.
- `+punish add 4 10m mute 15m` crée une sanction au seuil de 4 points en 10 minutes. Les sanctions acceptées sont `mute`, `derank`, `kick`, `ban` ; seule `mute` utilise une durée finale. Les bans sont permanents. `+punish del <numéro>` retire une règle ; `+punish setup` restaure les règles par défaut après confirmation : 3/10m → mute 10m, 6/10m → mute 1h, 10/1h → kick. Une sanction déjà appliquée ne se répète pas pendant sa fenêtre ; une règle de seuil supérieur peut prendre le relais. Les échecs apparaissent dans modlog et ne sont pas retentés automatiquement pendant cette fenêtre.
- `+timeout on/off` choisit les timeouts Discord ou un rôle muet. Un timeout ne dépasse pas 28 jours et un timeout déjà plus long n’est pas raccourci. `+muterole` crée ou met à jour le rôle Muet et affiche les erreurs de permissions par salon ; `+set muterole <rôle>` choisit un rôle existant. Relance `+muterole` après la création de nouveaux salons. Discord peut autoriser l’écriture via un autre rôle ou un overwrite de membre : les timeouts sont préférables pour éviter ces contournements. Les mutes par rôle temporaires utilisent le planificateur persistant ; un rôle muet déjà permanent n’est pas converti en rôle temporaire.
- `+noderank add/del <rôle>` protège des rôles lors des sanctions derank de l’automod et de l’antiraid. `+clear limit 250` définit une limite de 1 à 1000 messages ; `+clear 250` supprime les messages précédant la commande par lots, en conservant les messages épinglés et ceux de plus de 14 jours.
- `+public on/off` contrôle les commandes publiques, y compris les commandes personnalisées. `+public allow/deny/reset [salon]` ajoute des exceptions. Les commandes administratives et les accès des administrateurs restent disponibles. `+settings`, `+join settings` et `+leave settings` réutilisent les réglages existants.

Les sanctions nécessitent les permissions Discord et une hiérarchie de rôles compatible. `+settings` inclut le récapitulatif des protections et des limites de modération.

La catégorie **Logs** (`commands/logs/`) dispose d’une seule page dans le help. `+modlog`, `+messagelog`, `+voicelog`, `+boostlog` et `+rolelog` acceptent `on [salon]` ou `off`. `+raidlog [salon]` réutilise la configuration antiraid. Les réglages de logs sont sauvegardés dans `data/server-config.json` et inclus dans les resets.

`+autoconfiglog` demande confirmation puis crée les salons manquants avec accès privé : administrateurs, bot et auteur de la commande. Les salons existants sont conservés. Pour donner accès à d’autres membres du staff, adapte les permissions Discord des salons. `+nolog add/del [salon]` exclut ou réactive les logs de messages et de vocal ; plusieurs salons peuvent être séparés par `,,`. Les messages dans les salons de logs ne sont pas relogués.

`+set modlogs` active ou désactive les catégories bans/débannissements, expulsions, timeouts et suppressions via l’audit Discord. Le bot doit avoir View Audit Log ; une attribution absente est affichée comme inconnue. Le contenu des messages supprimés ou la version précédente d’un message modifié peut être indisponible lorsqu’il n’était pas en cache. Les logs ne reconstituent pas un historique antérieur à leur activation.

`+boostembed on/off`, `+set boostembed` et `+boostembed test` configurent le message de remerciement et son salon. Les variables `{member}`, `{user}`, `{server}` et `{count}` sont disponibles. La détection utilise le passage du membre à l’état de booster : un boost supplémentaire du même membre déjà booster n’est pas détectable avec cet événement. `+settings` affiche les réglages du serveur ; `+join settings`, `+leave settings` et `+modmail` réutilisent les menus existants.

La catégorie **Configuration du serveur** est dans `commands/configuration/` et occupe une seule page du help. Les réglages sont persistants dans `data/server-config.json`. Les menus de configuration sont réservés aux administrateurs ; les membres utilisent leurs tickets, menus de rôles et vocaux temporaires.

- `+ticket settings` publie le bouton de création des tickets privés. `+claim` est réservé au support ; `+rename`, `+add`, `+del` et `+close` sont accessibles au créateur et au support. La fermeture supprime le salon après confirmation et peut écrire un log, sans archiver les messages.
- `+rolemenu [ID du message]` crée ou modifie un sélecteur de rôles (25 maximum). Les rôles dangereux, gérés ou supérieurs au bot sont refusés et revérifiés à chaque utilisation.
- Dans Général, `+tempvoc` affiche le vocal à rejoindre pour créer son vocal temporaire ; `+tempvoc cmd` affiche ses commandes de gestion. `+tempvoc settings` reste dans Configuration du serveur pour régler le vocal de création et sa catégorie. Les salons héritent des restrictions de leur catégorie et sont supprimés lorsqu’ils sont vides.
- `+join settings` et `+leave settings` acceptent `{member}`, `{user}`, `{server}` et `{count}`. `+soutien` utilise le statut personnalisé : active **Presence Intent** dans le portail Discord, en plus de Server Members Intent et Message Content Intent. Un statut invisible ou absent ne retire pas automatiquement le rôle.
- `+reminder` ouvre un formulaire : date ISO avec fuseau explicite, par exemple `2026-10-02T18:00:00-04:00`, ou durée comme `2h`. `+reminder <nombre>` modifie un message et `+reminder list` liste les messages. Les échéances passées pendant un arrêt sont traitées au redémarrage.
- Dans Owners, `+custom <mot-clé>` configure une réponse sans exécution de code ; `{args}` contient les arguments. La création, modification et le transfert par `+custom transfer <ID/nombre>` sont réservés aux owners du bot, avec accès revérifié à la soumission du formulaire. `+clear customs` demande confirmation.
- `+set perm <commande/permission> <rôle/membre>` ajoute un accès local ; `+del perm <rôle>` et `+clear perms` le retirent. Les permissions acceptées sont `admin`, `everyone`, les noms Discord comme `ManageMessages`, ou un ID de rôle. Les commandes owner et les fonctions administratives verrouillées restent protégées. Sépare plusieurs destinataires ou rôles par `,,`.
- `+suggestion settings` permet de changer le salon initial `1555237521238134804` ou de désactiver les suggestions. `+modmail` choisit une catégorie et limite le modmail configuré à un serveur. `+report settings` ajoute le clic droit **Applications → Signaler le message** et son salon de logs.
- `+twitch` utilise `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET` dans l’environnement du processus, conformément à l’[authentification Twitch](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth). Sans ces identifiants, l’activation explique ce qui manque. Les lives sont vérifiés chaque minute.
- `+slowmode`, `+autodelete`, `+restrict`, `+unrestrict`, `+prefix`, `+autopublish` et `+show pics` complètent la configuration. Les photos automatiques utilisent un intervalle minimum de 5 minutes.

Les réglages de cette catégorie sont inclus dans les resets. Les salons déjà créés restent présents après un reset et doivent être gérés manuellement si nécessaire.

`npm install` puis `npm start` pour démarrer le bot.

## Help automatique

Utilise `!help` (ou le préfixe de ton serveur) pour afficher les catégories avec les boutons de navigation. Le menu reste actif pendant trois minutes et seul son auteur peut le contrôler.

Chaque catégorie occupe une seule page : Général, Owners, etc. Toutes ses commandes sont regroupées sur cette page. Si une catégorie dépasse la limite de texte des embeds Discord, la liste complète est jointe dans un fichier texte, sans créer de pages supplémentaires.

Ajoute une commande `.js` dans `commands/<categorie>/`, puis redémarre le bot : elle sera chargée et ajoutée au help. Les sous-dossiers sont aussi chargés. Les dossiers `owner` et `owners`, ainsi que leurs sous-dossiers, sont réservés aux owners configurés dans `config.json`.

Exemple dans `commands/moderation/ban.js` :

```js
module.exports = {
    name: "ban",
    description: "Bannit un membre du serveur.",
    usage: "ban <membre> [raison]",
    async execute(message, args, client) {
        // Code de la commande et vérification des permissions.
    }
};
```

Le dossier définit la catégorie par défaut. `category: "Configuration du serveur"` permet de choisir son nom. `hidden: true` masque une commande du help. `ownerOnly: true` réserve une commande aux owners, même en dehors d'un dossier owner.

Les nouvelles commandes doivent vérifier elles-mêmes les permissions Discord nécessaires.

`npm test` lance les tests sans connecter le bot à Discord.

## Commandes générales

Le préfixe par défaut est `+`. Un préfixe personnalisé enregistré pour un serveur reste prioritaire.

Les commandes de listes récupèrent tous les membres du serveur : active **Server Members Intent** et **Message Content Intent** dans le portail développeur Discord. Le bot doit pouvoir voir les salons, envoyer des messages et intégrer des liens (Embed Links).

`suggestion <message>` publie dans le salon courant, ou dans `suggestionChannelId` si cet ID est défini dans `config.json`. Les boutons Pour/Contre permettent un vote par utilisateur, modifiable ou annulable en recliquant. L’auteur ne peut pas voter pour sa propre suggestion. Les votes sont enregistrés dans `data/suggestions.json`, et `lb suggestions` les classe par score net (pour moins contre).

`snipe` affiche le dernier message humain supprimé que le bot a pu observer, dans le même salon, pendant une heure maximum. Le cache est en mémoire et disparaît au redémarrage. Les messages non mis en cache ne peuvent pas être récupérés.

`calc` prend en charge `+ - * / % ^`, les parenthèses et les équations linéaires en `x` (exemple : `+calc 2x + 3 = 11`). Les équations non linéaires ne sont pas prises en charge.

`wiki` affiche le résumé du premier résultat Wikipedia en français ; `search wiki` affiche jusqu’à 20 articles avec un lien vers tous les résultats.

`image` fournit un lien vers Google Images. Pour afficher directement une image via l’API Google Custom Search, définis `GOOGLE_API_KEY` et `GOOGLE_SEARCH_ENGINE_ID` dans l’environnement, ou `googleApiKey` et `googleSearchEngineId` dans `config.json`. Cela nécessite un compte disposant de l’accès à cette API.

`protect` utilise le lien de support fourni ; `supportInvite` dans `config.json` permet de le remplacer. Les notes de `changelogs` se modifient dans `data/changelogs.json`.

Les nouvelles notes de mise à jour sont annoncées dans le salon `updateChannelId` (1555239058991485088), au démarrage ou après une mise à jour Git installée. Chaque version est publiée une seule fois par salon ; l’historique est enregistré dans `data/update-announcements.json`. Ajoute une nouvelle version en tête de `data/changelogs.json` pour une nouvelle annonce. Le bot doit pouvoir envoyer des messages et des embeds dans le salon.

## Commandes owner

Toutes les commandes du dossier `commands/owners` sont réservées aux owners, y compris lorsqu’on utilise un alias. Elles apparaissent dans la catégorie Owners du help uniquement pour les owners. Le premier ID de `config.json.owners` est le propriétaire principal : `unowner` et `clear owners` le conservent pour éviter de perdre le contrôle du bot. Les réglages runtime sont sauvegardés dans `data/settings.json`.

- Profil : `+set name Protect`, `+set pic <URL>`, `+set banner <URL>`, `+set profil`. Sans valeur, un formulaire est proposé. `remove` à la place d’une URL retire l’image. Discord limite la fréquence des changements de profil.
- Thème : `+theme #ED1515` (ou rouge, bleu, vert, noir, blanc, violet).
- Présence : `+playto phrase 1,,phrase 2`, `+listen`, `+watch`, `+compet`, `+stream`, `+remove activity`, `+online`, `+idle`, `+dnd`, `+invisible`. Les activités alternent toutes les 15 secondes. Pour stream, un formulaire demande un lien Twitch/YouTube si aucun lien n’est encore configuré ; `+stream https://www.twitch.tv/chaine texte` est aussi accepté.
- MP : `+mp settings` propose d’activer/désactiver les envois ; `+mp settings on/off` applique directement le réglage. `+mp <mention/ID> <message>` envoie un seul MP. Les utilisateurs peuvent avoir bloqué les MP.
- Serveurs : `+server list` donne une numérotation stable par ID, utilisée par `+invite <ID/numéro>`, `+leave [ID/numéro]`, `+discussion <ID/numéro>`. Les invitations durent une heure et sont limitées à une utilisation. Elles sont envoyées au demandeur en privé lorsque les MP sont activés. `leave` demande une confirmation. `server pic/banner` reste une commande générale.
- Discussion : choisis le serveur, puis envoie l’ID du salon cible proposé. Tes messages suivants sont relayés pendant 5 minutes et les réponses humaines du salon cible apparaissent dans ton salon de commande. `stop` termine la session. Les pièces jointes ne sont pas relayées.
- FiveM : `+fivem` utilise le lien `https://cfx.re/join/bddy34d` fourni. `+fivem <lien Cfx ou http://IP:30120>` change le serveur. `+fivem off` déconnecte le suivi. Le bot affiche les informations accessibles par HTTP ; il ne donne pas accès à la console FiveM. Si l’API Cfx refuse la requête, utilise l’adresse directe du serveur.
- Owners : `+owner`, `+owner <mention/ID>`, `+unowner <mention/ID>`, `+clear owners`.
- Blacklist : `+bl`, `+bl <mention/ID> [raison]`, `+blinfo <mention/ID>`, `+unbl <mention/ID>`, `+clear bl`. L’ajout déclenche des tentatives de bannissement sur tous les serveurs et les nouveaux joins. Les erreurs de permissions ou de hiérarchie sont signalées. Retirer une blacklist n’annule pas les bans Discord déjà effectués.
- Permissions : `+change ping admin`, `+change ping everyone`, `+change <commande> ManageMessages`, `+change <commande> <ID de rôle>`, `+changeall everyone admin`, `+change reset`. Les commandes owner restent toujours owner-only. Les owners peuvent utiliser toutes les commandes. `0` équivaut à everyone.
- Préfixe et invitation : `+mainprefix <préfixe>` change le préfixe par défaut, y compris en MP. Les préfixes personnalisés des serveurs restent prioritaires. `+secur invite on/off` quitte les **nouveaux** serveurs qui ne contiennent pas le propriétaire principal.
- Help : `+helptype button/select/hybrid`, `+alias ping [nom_alias]`, `+helpalias on/off`. Sans nom d’alias, un formulaire s’ouvre. Le sélecteur gère aussi plus de 25 pages grâce aux boutons de groupe.
- Langues : `+set lang fr/en` change la langue du help et des libellés communs ; les textes qui n’ont pas de traduction restent français. `+get lang` exporte les dictionnaires. Joins un dictionnaire JSON à `+lang custom fichier` pour importer tes traductions exactes ; `+lang custom on/off` active/désactive son utilisation. Aucun token n’est inclus dans l’export.
- Mise à jour : `+updatebot` nécessite Git sur le PATH et un dépôt local propre avec une branche suivie sur un dépôt distant. Il récupère les mises à jour et effectue uniquement une avance rapide ; il n’écrase pas les modifications locales. Aucun dépôt source n’a encore été fourni pour ce projet. `+autoupdate on/off` active/désactive la vérification horaire. Le bot ne redémarre pas automatiquement ; les dépendances changées doivent être réinstallées avec `npm install`.
- Réinitialisation : `+reset server` supprime le préfixe personnalisé, les suggestions enregistrées et les snipes du serveur courant. `+resetall` réinitialise les réglages runtime, les préfixes, les suggestions et les snipes. Une confirmation est requise dans Discord. Les messages envoyés, bans Discord et le profil Discord du bot ne sont pas annulés. Le token, le propriétaire principal et la configuration de base sont conservés.

Le bot doit avoir les permissions Discord nécessaires à chaque action (notamment Ban Members et Create Instant Invite). Le statut owner interne ne contourne pas les permissions Discord ni la hiérarchie des rôles.

## Antiraid

Les commandes se trouvent dans `commands/antiraid/`, avec une seule page **Antiraid** dans le help. La configuration nécessite Administrateur, le propriétaire du serveur ou un owner du bot. `change` et `changeall` ne peuvent pas rendre ces commandes publiques. Les réglages sont stockés par serveur dans `data/antiraid.json` et inclus dans `reset server` / `resetall`.

Les protections sont **désactivées par défaut**. Exemple de configuration :

```text
+raidlog on #logs-antiraid
+raidping @Staff
+antitoken 5/10s
+antiban 3/10s
+antieveryone 3/10s
+antideco 3/10s
+creation limit 7j
+wl @PersonneDeConfiance
+secur on
```

- `off` désactive la protection ; `on` respecte la whitelist ; `max` ignore la whitelist. Le propriétaire du serveur, les owners du bot et le bot restent exemptés. `secur` affiche tous les réglages ; `secur off/on/max` change toutes les protections. `secur off` retire aussi l’âge minimum et le verrouillage des arrivées. `secur invite on/off` reste une commande owner distincte.
- Les durées acceptent `ms`, `s`, `m`, `h`, `j` ou `d`, et les durées sans unité sont en secondes. Les sensibilités acceptent 1 à 1000 événements sur 1 seconde à 1 heure. Les comptes jeunes sont filtrés selon `creation limit` ; `creation limit 0` désactive cette limite.
- Les mentions peuvent être groupées avec des espaces. Sépare les noms exacts et IDs par `,,` : `+wl ID1,,ID2` ou `+raidping Nom du rôle,,Autre rôle`. Les noms ambigus sont refusés.
- L’antitoken déclenche au seuil de joins, retire le membre déclencheur puis bloque les nouveaux arrivants pendant cinq minutes. `antitoken lock` maintient le verrouillage jusqu’à `antitoken on/off`. Discord ne fournit pas de refus avant l’arrivée : le bot expulse ou bannit après le join, sous réserve de permissions. Les premiers membres de la vague ne sont pas expulsés rétroactivement.
- `punition <fonction/all> derank/kick/ban` choisit la sanction. `derank` retire les rôles non gérés situés sous le bot. Pour antitoken, derank est suivi d’une expulsion pour maintenir le blocage des arrivées ; ban bannit directement. La blacklist rank retire les rôles concernés et applique également kick/ban si configuré.
- `antirole danger/all` définit la portée des rôles protégés ; `blrank danger/all` définit les rôles retirés aux membres blacklist rank. Les permissions dangereuses incluent Administrateur, gérer le serveur/rôles/salons/webhooks, bannir, expulser, mentionner everyone et modérer des membres.
- `blrank add/del <membre>` modifie la blacklist rank. Les rôles sont contrôlés sur les joins et les mises à jour de membres. `wl`, `unwl` et `clear wl` gèrent la whitelist du serveur. `clear webhooks` supprime les webhooks après confirmation et signale les échecs. Les opérations `clear owners/bl` restent owner-only.
- `raidlog on/off [salon]` configure les logs ; `raidping` configure les rôles mentionnés. `raidping off` retire les mentions. Le bot doit pouvoir mentionner ces rôles.

Les protections d’actions administratives utilisent l’événement d’audit Discord et son auteur exact. Le bot doit avoir **View Audit Log**, ainsi que les permissions d’action nécessaires (**Manage Roles**, **Manage Channels**, **Manage Guild**, **Manage Webhooks**, **Kick Members**, **Ban Members**, **Manage Messages**, **Embed Links**). Place son rôle au-dessus des rôles qu’il doit retirer ou sanctionner. [Discord précise les conditions d’accès aux événements d’audit](https://github.com/discord/discord-api-docs/blob/main/developers/events/gateway-events.mdx).

Une action Discord peut déjà avoir eu lieu avant sa détection. Le bot tente de restaurer les paramètres simples et les attributions de rôles, rebannit après un unban, supprime les nouveaux bots/salons/rôles/webhooks non autorisés et recrée les salons/rôles supprimés lorsqu’une copie récente est disponible. Une ressource recréée a un **nouvel ID** : messages, affectations de membres, invites et références externes ne sont pas restaurés. Les modifications/suppressions de webhooks, certains attributs de serveur et les déconnexions vocales ne sont pas annulables automatiquement ; leur auteur est sanctionné et les limites sont signalées dans les logs.

Les fenêtres de détection, la déduplication des audits et les copies de ressources sont en mémoire et sont perdues au redémarrage. Les seuils et les blocages antitoken en cours sont persistants.

## Gestion du serveur

Le dossier `commands/gestion/` fournit une seule page **Gestion du serveur** dans le help. La configuration et les actions sont réservées aux administrateurs, au propriétaire du serveur et aux owners du bot. Les rôles doivent être situés sous celui du bot, et sous celui du demandeur sauf pour le propriétaire et les owners du bot. Les fonctions persistantes sont enregistrées dans `data/management.json`.

- `+giveaway` ouvre un formulaire : lot, durée (ex. 1h), nombre de gagnants et salon. Les membres participent avec le bouton, et recliquent pour retirer leur participation. Le tirage exclut les bots, les utilisateurs blacklistés et ceux ayant quitté le serveur. `+end giveaway <ID>` termine le giveaway ; `+reroll` rejoue le dernier terminé en excluant les gagnants précédents. Si aucun autre participant n’est disponible, aucun nouveau gagnant n’est annoncé. Les giveaways expirés pendant un arrêt du bot sont traités au redémarrage, avec une précision d’environ 15 secondes en fonctionnement normal.
- `+choose` s’utilise en réponse au message du tirage, ou avec son ID/lien : le bot choisit un utilisateur parmi les réactions, sans doublons ni bots. Il doit pouvoir lire le message et son historique.
- `+embed` ouvre un formulaire pour le titre, le texte, la couleur, l’image et le salon de publication.
- `+backup serveur <nom>` sauvegarde les rôles non gérés, salons pris en charge, catégories et leurs permissions. `+backup emoji <nom>` sauvegarde les images des émojis. `+backup list serveur/emoji`, `+backup delete serveur/emoji <nom>` et `+backup load serveur/emoji <nom>` gèrent les backups du serveur courant. Suppression et chargement demandent une confirmation. Un chargement **ajoute** les ressources avec de nouveaux IDs, sans supprimer l’existant. Messages, fils, adhésions aux rôles, permissions globales du rôle everyone, restrictions d’utilisation des émojis et liens externes ne sont pas restaurés. Les webhooks, intégrations et rôles gérés ne sont pas recréés. Les échecs sont signalés et certains salons ne seront pas recréés si un rôle de leurs permissions manque.
- `+autobackup serveur/emoji <jours>` programme une backup automatique (1 à 365 jours). `0` la désactive. La sauvegarde nommée `automatique` est remplacée à chaque exécution. Une exécution échouée est réessayée une heure plus tard. Les jobs reprennent au démarrage du bot.
- `+loading 10s Préparation…` affiche une barre de chargement pendant la durée indiquée (1s à 1h). C’est une animation, pas un suivi d’une opération réelle ; elle ne reprend pas après redémarrage.
- `+create <:emoji:ID> nom` ou `+create nom` avec une image jointe crée un émoji (image 256 ko maximum). `+newsticker [nom]` crée un sticker envoyé avec la commande ou cité en réponse, en PNG/APNG/GIF (512 ko maximum). Le serveur doit avoir un emplacement disponible. Les stickers Lottie ne sont pas pris en charge.
- `+massiverole @Cible [@Source]` et `+unmassiverole @Cible [@Source]` modifient les membres en masse après confirmation. Sans rôle source, tous les membres sont concernés. Les noms et IDs se séparent par `,,`, avec la cible en premier. Sans argument, un formulaire propose les rôles.
- `+voicemove #Départ #Arrivée` déplace les membres du premier salon vers le second. Avec un seul salon, le départ est ton vocal actuel. Sans argument, un formulaire demande les salons. Les noms se séparent par `,,`. `+voicekick @Membre`, `+cleanup #Salon` et `+bringall [#Salon]` déconnectent ou déplacent les membres après confirmation. Sans salon cible pour bringall, ton vocal actuel est utilisé. Les erreurs de permissions et salons pleins sont signalées.
- `+renew [#Salon]` recrée un salon textuel classique après confirmation : le contenu disparaît, l’ID change, et les réglages qui utilisaient l’ancien ID doivent être reconfigurés. `+unbanall` retire les bans Discord après confirmation, sans modifier la blacklist du bot.
- `+temprole @Membre @Rôle 1h` ou `+temprole Nom membre,,Nom rôle,,1h` ajoute un rôle temporaire. Le rôle permanent d’un membre ne peut pas être transformé en temporaire. Une nouvelle durée pour un rôle déjà temporaire prolonge/remplace l’échéance. `+untemprole @Membre @Rôle` le retire. Les expirations restent enregistrées et sont traitées après redémarrage ; les erreurs de retrait sont réessayées.
- `+sync #Salon`, `+sync Catégorie` ou `+sync all` synchronisent les salons avec leur catégorie parente après confirmation.
- `+openmodmail @Membre` ouvre un salon privé visible des administrateurs et du bot, sans envoyer de MP. Les messages du staff dans le ticket sont ensuite relayés au membre en MP, et ses réponses sont relayées dans le ticket. Le bouton Fermer coupe le relais. Si plusieurs tickets sont ouverts pour le même utilisateur, celui-ci choisit le serveur avec `[ID du serveur] réponse`. Les pièces jointes ne sont pas relayées. Le membre doit accepter les MP, et le réglage `mp settings` doit autoriser les envois.
- En réponse à un message du bot, `+button add https://exemple.com` ajoute un bouton lien et `+button del https://exemple.com` le retire. Un ID/lien du message peut être ajouté comme troisième argument, suivi d’un libellé facultatif. Les limites Discord de composants sont respectées.
- `+autoreact add #Salon 👍`, `+autoreact del #Salon 👍`, `+autoreact list` configurent jusqu’à 20 réactions automatiques par salon. Le bot ne réagit pas à ses propres messages ni aux messages des bots.
- `+formulaire` ouvre un générateur : titre, 1 à 5 questions séparées par `,,`, salon de logs et salon de publication. Chaque question contient au plus 45 caractères. Le bouton Répondre ouvre une fenêtre privée et envoie la réponse seulement au salon de logs. `+formulaire <ID du message>` permet de modifier un formulaire existant. Le bouton et sa configuration restent utilisables après redémarrage.

La réinitialisation d’un serveur ou du bot supprime les réglages d’autoreact, de formulaires, de tickets et d’autobackup. Les backups, les giveaways en cours et les échéances des rôles temporaires sont conservés pour ne pas perdre les sauvegardes ni abandonner une expiration promise. Les anciennes publications de formulaires et les salons modmail ne sont pas supprimés automatiquement.

Les actions nécessitent les permissions Discord correspondantes : notamment Manage Roles, Manage Channels, Move Members, Ban Members, Manage Guild Expressions/Create Guild Expressions, Add Reactions, Read Message History, Send Messages et Embed Links. Une action en masse peut réussir partiellement ; le résultat indique les échecs.
