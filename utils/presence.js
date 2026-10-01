const settings = require('./settings');
function apply(client) {
    if (client.activityTimer) clearInterval(client.activityTimer);
    client.activityTimer = null;
    let index = 0;
    const update = () => {
        const { status, activity } = settings.read();
        const messages = activity?.messages || [];
        client.user.setPresence({ status, activities: messages.length ? [{ name: messages[index++ % messages.length], type: activity.type, ...(activity.url ? { url: activity.url } : {}) }] : [] });
    };
    update();
    if (settings.read().activity?.messages.length > 1) {
        client.activityTimer = setInterval(update, 15000);
        client.activityTimer.unref();
    }
}
module.exports = { apply };
