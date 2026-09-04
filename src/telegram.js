import { getHostChatId } from './hosts';

export const sendTelegramMessage = async (visitorOrName, hostNameArg, extraArg) => {
    const token = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
    const defaultChatId = import.meta.env.VITE_TELEGRAM_CHAT_ID;

    let visitorName = '';
    let hostName = '';
    let company = '';
    let purpose = '';
    let id = '';
    let hostChatId = '';

    if (typeof visitorOrName === 'object' && visitorOrName !== null) {
        visitorName = visitorOrName.name || visitorOrName.visitorName || 'Visitor';
        hostName = visitorOrName.hostName || 'Host';
        company = visitorOrName.company || '';
        purpose = visitorOrName.purpose || 'Meeting';
        id = visitorOrName.id || '';
        hostChatId = visitorOrName.hostChatId || '';
    } else {
        visitorName = visitorOrName || 'Visitor';
        hostName = hostNameArg || 'Host';
        if (typeof extraArg === 'object' && extraArg !== null) {
            company = extraArg.company || '';
            purpose = extraArg.purpose || 'Meeting';
            id = extraArg.id || '';
            hostChatId = extraArg.hostChatId || '';
        }
    }

    const targetChatId = hostChatId || getHostChatId(hostName) || defaultChatId;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const message = `🔔 *Visitor Arrival Alert*\n\nHello *${hostName}*,\nYour visitor *${visitorName}*${company ? ` from *${company}*` : ''} has arrived and checked in to see you.\n\n📋 *Purpose:* ${purpose || 'Meeting'}\n🆔 *Visitor ID:* ${id || '-'}\n⏰ *Time:* ${timeStr}`;

    if (!token || !targetChatId) {
        console.warn("Telegram credentials missing in environment. Logging message:");
        console.log("------------------------");
        console.log(`Target Chat ID: ${targetChatId}`);
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
                chat_id: targetChatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });

        const resData = await response.json();
        if (!response.ok) {
            console.error("Failed to send Telegram message:", resData);
        } else {
            console.log("Telegram arrival alert sent successfully:", resData);
        }
    } catch (error) {
        console.error("Error connecting to Telegram API", error);
    }
};
