import { getCollection } from './_db.js';

const TELEGRAM_TOKEN = process.env.VITE_TELEGRAM_BOT_TOKEN;

async function sendReply(chatId, text) {
    if (!TELEGRAM_TOKEN) return;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
}

export default async function handler(req, res) {
    // Only accept POST from Telegram
    if (req.method !== 'POST') {
        return res.status(200).json({ ok: true, message: 'Webhook is active' });
    }

    try {
        const update = req.body;
        const message = update?.message;

        if (!message || !message.text) {
            return res.status(200).json({ ok: true });
        }

        const chatId = message.chat.id.toString();
        const text = message.text.trim();
        const username = message.from?.username || '';
        const firstName = message.from?.first_name || '';

        const hostsCollection = await getCollection('hosts');

        // Handle /start command with host name parameter
        if (text.startsWith('/start')) {
            const parts = text.split(' ');

            if (parts.length < 2) {
                // No host name provided — show help
                await sendReply(chatId,
                    `👋 *Welcome to Esstee Exports Visitor Bot!*\n\nTo register for private visitor alerts, use the registration link provided by your office admin.\n\nExample: \`https://t.me/BotName?start=YOUR_NAME\``
                );
                return res.status(200).json({ ok: true });
            }

            // Extract host name: replace underscores with spaces, uppercase
            const hostName = parts.slice(1).join(' ').replace(/_/g, ' ').toUpperCase();

            try {
                // Upsert into hosts collection in MongoDB
                await hostsCollection.updateOne(
                    { name: { $regex: `^${hostName}$`, $options: 'i' } },
                    {
                        $set: {
                            name: hostName,
                            chat_id: chatId,
                            telegram_username: username,
                            registered_at: new Date().toISOString()
                        }
                    },
                    { upsert: true }
                );

                await sendReply(chatId,
                    `✅ *Registration Successful!*\n\nHello *${firstName || hostName}*,\nYou are now registered as *${hostName}*.\n\n📬 You will receive *private visitor arrival alerts* directly in this chat.\n\nNo further action needed!`
                );
            } catch (err) {
                console.error('MongoDB hosts upsert error:', err);
                await sendReply(chatId, '❌ Registration failed. Please try again or contact your admin.');
            }

            return res.status(200).json({ ok: true });
        }

        // Handle /status command — let host check their registration
        if (text.startsWith('/status')) {
            const host = await hostsCollection.findOne({ chat_id: chatId });

            if (host) {
                const regDate = host.registered_at ? new Date(host.registered_at).toLocaleDateString() : 'Unknown';
                await sendReply(chatId,
                    `📋 *Your Registration*\n\nName: *${host.name}*\nRegistered: ${regDate}\n\n✅ You will receive private visitor alerts.`
                );
            } else {
                await sendReply(chatId,
                    `⚠️ You are not registered yet.\nPlease use the registration link provided by your office admin.`
                );
            }

            return res.status(200).json({ ok: true });
        }

        // Ignore other messages
        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('Webhook handler error:', err);
        // Always return 200 to Telegram to prevent retries
        return res.status(200).json({ ok: true });
    }
}
