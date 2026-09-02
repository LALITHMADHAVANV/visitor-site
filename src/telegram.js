export const sendTelegramMessage = async (visitorName, hostName, pin) => {
    const token = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
    const defaultChatId = import.meta.env.VITE_TELEGRAM_CHAT_ID;

    const message = `🔔 Visitor Check-In Successful\n\nVisitor: ${visitorName}\nHost: ${hostName}\nExit PIN: ${pin}\n\nPlease provide this PIN to the visitor when they are ready to exit.`;

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
