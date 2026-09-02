export const sendTelegramMessage = async (visitorName, hostName, pin) => {
    const token = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
    const defaultChatId = import.meta.env.VITE_TELEGRAM_CHAT_ID; // Fallback chat ID

    const message = `🔔 *New Visitor Arrival*\n\n*${visitorName}* is here to see *${hostName}*.\n\nTo approve this visit, please share this PIN with them:\n🎯 *${pin}*`;

    if (!token || !defaultChatId) {
        console.warn("Telegram credentials not configured in .env. Logging message instead:");
        console.log("------------------------");
        console.log(message);
        console.log("------------------------");
        return;
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: defaultChatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });

        if (!response.ok) {
            console.error("Failed to send Telegram message", await response.text());
        }
    } catch (error) {
        console.error("Error connecting to Telegram API", error);
    }
};
