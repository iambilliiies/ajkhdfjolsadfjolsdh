module.exports = {
    name: 'messageDelete',
    execute(message, client) {
        if (!message.guild || !message.author || message.author.bot) return;
        if (!client.snipes) client.snipes = new Map();
        const now = Date.now();
        for (const [id, record] of client.snipes) if (now - record.deletedAt > 3600000) client.snipes.delete(id);
        client.snipes.set(message.channel.id, { content: message.content?.slice(0, 3500), author: `${message.author.tag} (${message.author.id})`, deletedAt: now });
        if (client.snipes.size > 1000) client.snipes.delete(client.snipes.keys().next().value);
    }
};
