let token = null, expiresAt = 0;
async function streams(usernames) {
    const clientId = process.env.TWITCH_CLIENT_ID, secret = process.env.TWITCH_CLIENT_SECRET;
    if (!clientId || !secret) throw new Error('Configure TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET dans l’environnement du bot.');
    if (!token || Date.now() >= expiresAt) {
        const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'client_credentials' }), signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Authentification Twitch refusée.');
        const result = await response.json(); token = result.access_token; expiresAt = Date.now() + Math.max(0, result.expires_in - 60) * 1000;
    }
    const params = new URLSearchParams({ first: '100' }); usernames.forEach(name => params.append('user_login', name));
    const response = await fetch(`https://api.twitch.tv/helix/streams?${params}`, { headers: { 'Client-Id': clientId, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    if (response.status === 401) token = null;
    if (!response.ok) throw new Error(`Twitch indisponible (HTTP ${response.status}).`);
    return (await response.json()).data;
}
module.exports = { streams };
