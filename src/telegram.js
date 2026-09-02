export const sendTelegramMessage = async (visitorName, hostName, pin) => {
    const token = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
    const defaultChatId = import.meta.env.VITE_TELEGRAM_CHAT_ID; // Fallback chat ID

    const message = `🔔 Visitor PIN Request\n\n${visitorName} is checking in with ${hostName}.\n\nHost PIN: ${pin}`;

    if (!token || !defaultChatId) {
        console.warn("Telegram credentials missing in environment. Logging message:");
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
                text: message
            })
        });

        const resData = await response.json();
        if (!response.ok) {
            console.error("Failed to send Telegram message:", resData);
        } else {
            console.log("Telegram message sent successfully:", resData);
        }
    } catch (error) {
        console.error("Error connecting to Telegram API", error);
    }
};
