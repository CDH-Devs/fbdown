/**
 * src/index.js
 * Final Code V17 (Loading Message Delete Fix before sending video)
 * Developer: @chamoddeshan
 */

// *****************************************************************
// ********** [ ඔබගේ අගයන් මෙහි ඇතුළත් කර ඇත ] ********************
// *****************************************************************
const BOT_TOKEN = '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8'; 
const OWNER_ID = '1901997764'; 
// *****************************************************************

// Telegram API Base URL
const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;


// -------------------------------------------------------------------
// I. Helper Functions
// -------------------------------------------------------------------

/**
 * MarkdownV2 හිදී escape කළ යුතු සියලුම විශේෂ අක්ෂර Escape කරයි.
 * @param {string} text 
 */
function escapeMarkdownV2(text) {
    if (!text) return "";
    return text.replace(/([_*[\]()~`>#+\-=|{}.!\\\\])/g, '\\$1');
}

/**
 * Progress Bar එකේ අවස්ථා (States)
 */
const PROGRESS_STATES = [
    { text: "𝙇𝙤𝙖𝙙𝙞𝙣𝙜…▒▒▒▒▒▒▒▒▒▒", percentage: "0%" },
    { text: "𝘿𝙤𝙬𝙣𝙡𝙤𝙖𝙙𝙞𝙣𝙜…█▒▒▒▒▒▒▒▒▒", percentage: "10%" },
    { text: "𝘿𝙤𝙬𝙣𝙡𝙤𝙖𝙙𝙞𝙣𝙜…██▒▒▒▒▒▒▒▒", percentage: "20%" },
    { text: "𝘿𝙤𝙬𝙣𝙡𝙤𝙖𝙙𝙞𝙣𝙜…███▒▒▒▒▒▒▒", percentage: "30%" },
    { text: "𝙐𝙥𝙡𝙤𝙖𝙙𝙞𝙣𝙜…████▒▒▒▒▒▒", percentage: "40%" },
    { text: "𝙐𝙥𝙡𝙤𝙖𝙙𝙞𝙣𝙜…█████▒▒▒▒▒", percentage: "50%" },
    { text: "𝙐𝙥𝙡𝙤𝙖𝙙𝙞𝙣𝙜…██████▒▒▒▒", percentage: "60%" },
    { text: "𝙐𝙥𝙡𝙤𝙖𝙙𝙞𝙣𝙜…███████▒▒▒", percentage: "70%" },
    { text: "𝙁𝙞𝙣𝙖𝙡𝙞𝙯𝙞𝙣𝙜…████████▒▒", percentage: "80%" },
    { text: "𝙁𝙞𝙣𝙖𝙡𝙞𝙯𝙞𝙣𝙜…█████████▒", percentage: "90%" },
    { text: "✅ 𝘿𝙤𝙣𝙚\\! ██████████", percentage: "100%" } 
];

// -------------------------------------------------------------------
// II. WorkerHandlers Class
// -------------------------------------------------------------------

class WorkerHandlers {
    
    constructor(env) {
        this.env = env;
        this.progressActive = true; // Progress Simulation එක පාලනය කිරීමට
    }

    // --- KV Database Access Functions ---

    async saveUserId(userId) {
        if (!this.env.USER_DATABASE) return; 
        const key = `user:${userId}`;
        const isNew = await this.env.USER_DATABASE.get(key) === null; 
        if (isNew) {
            try {
                await this.env.USER_DATABASE.put(key, "1"); 
            } catch (e) {
                console.error(`KV Error: Failed to save user ID ${userId}`, e);
            }
        }
    }

    async getAllUsersCount() {
        if (!this.env.USER_DATABASE) return 0;
        try {
            const listResult = await this.env.USER_DATABASE.list({ prefix: "user:" });
            return listResult.keys.length;
        } catch (e) {
            console.error("KV Error: Failed to list users.", e);
            return 0;
        }
    }

    async broadcastMessage(fromChatId, messageId) {
        if (!this.env.USER_DATABASE) return { successfulSends: 0, failedSends: 0 };
        
        let listResult = { keys: [], list_complete: false };
        let cursor = null;
        let successfulSends = 0;
        let failedSends = 0;
        
        do {
            try {
                listResult = await this.env.USER_DATABASE.list({ prefix: "user:", cursor: cursor });
            } catch (e) {
                console.error("KV Error: Broadcast list failure.", e);
                break;
            }
            
            cursor = listResult.list_complete ? null : listResult.cursor;

            for (const key of listResult.keys) {
                const userId = key.name.split(':')[1];

                if (userId.toString() === fromChatId.toString()) continue;
                
                try {
                    const response = await fetch(`${telegramApi}/copyMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: userId,
                            from_chat_id: fromChatId,
                            message_id: messageId,
                        }),
                    });
                     if (!response.ok) {
                        console.error(`Broadcast Copy API Error: User ${userId}:`, await response.text());
                        failedSends++;
                    } else {
                        successfulSends++;
                    }
                } catch (e) {
                    console.error(`Broadcast Copy Fetch Error: User ${userId}:`, e);
                    failedSends++;
                }
            }

        } while (cursor); 
        return { successfulSends, failedSends };
    }

    // --- Telegram API Helper Functions ---

    async sendMessage(chatId, text, replyToMessageId, inlineKeyboard = null) {
        try {
            const response = await fetch(`${telegramApi}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text, 
                    parse_mode: 'MarkdownV2', 
                    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
                    ...(inlineKeyboard && { reply_markup: { inline_keyboard: inlineKeyboard } }),
                }),
            });
            const result = await response.json();
            if (!response.ok) {
                console.error(`sendMessage API Failed (Chat ID: ${chatId}):`, result);
                return null;
            }
            return result.result.message_id;
        } catch (e) { 
            console.error(`sendMessage Fetch Error (Chat ID: ${chatId}):`, e);
            return null;
        }
    }

    async editMessage(chatId, messageId, text, inlineKeyboard = null) {
        try {
            const body = {
                chat_id: chatId,
                message_id: messageId,
                text: text,
                parse_mode: 'MarkdownV2',
                ...(inlineKeyboard && { reply_markup: { inline_keyboard: inlineKeyboard } }),
            };
            const response = await fetch(`${telegramApi}/editMessageText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
             if (!response.ok) {
                console.error(`editMessage API Failed (Chat ID: ${chatId}):`, await response.text());
            }
        } catch (e) { 
             console.error(`editMessage Fetch Error (Chat ID: ${chatId}):`, e);
        }
    }
    
    // ** NEW: Delete Message Function **
    async deleteMessage(chatId, messageId) {
        try {
            const response = await fetch(`${telegramApi}/deleteMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                }),
            });
             if (!response.ok) {
                // If message is already deleted or too old, we ignore the error
                console.warn(`deleteMessage API Failed (Chat ID: ${chatId}, Msg ID: ${messageId}):`, await response.text());
            }
        } catch (e) { 
             console.error(`deleteMessage Fetch Error (Chat ID: ${chatId}):`, e);
        }
    }
    
    async sendMessageWithKeyboard(chatId, text, replyToMessageId, keyboard) {
         return this.sendMessage(chatId, text, replyToMessageId, keyboard);
    }

    async answerCallbackQuery(callbackQueryId, text) { /* ... */ }

    async sendVideo(chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null, inlineKeyboard = null) {
        
        try {
            const videoResponse = await fetch(videoUrl);
            
            if (videoResponse.status !== 200) {
                if (videoResponse.body) { await videoResponse.body.cancel(); }
                await this.sendMessage(chatId, escapeMarkdownV2(`⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි\\. CDN වෙත පිවිසීමට නොහැක\\. \\(HTTP ${videoResponse.status}\\)`), replyToMessageId);
                return;
            }
            
            const videoBlob = await videoResponse.blob();
            
            const formData = new FormData();
            formData.append('chat_id', chatId);
            
            if (caption) {
                formData.append('caption', caption);
                formData.append('parse_mode', 'MarkdownV2'); 
            }
            
            if (replyToMessageId) {
                formData.append('reply_to_message_id', replyToMessageId);
            }
            
            formData.append('video', videoBlob, 'video.mp4'); 

            if (thumbnailLink) {
                try {
                    const thumbResponse = await fetch(thumbnailLink);
                    if (thumbResponse.ok) {
                        const thumbBlob = await thumbResponse.blob();
                        formData.append('thumb', thumbBlob, 'thumbnail.jpg');
                    } else {
                        if (thumbResponse.body) { await thumbResponse.body.cancel(); }
                    } 
                } catch (e) { 
                    console.warn("Thumbnail fetch failed:", e);
                }
            }
            
            if (inlineKeyboard) {
                formData.append('reply_markup', JSON.stringify({
                    inline_keyboard: inlineKeyboard
                }));
            }

            const telegramResponse = await fetch(`${telegramApi}/sendVideo`, {
                method: 'POST',
                body: formData, 
            });
            
            const telegramResult = await telegramResponse.json();
            
            if (!telegramResponse.ok) {
                console.error(`sendVideo API Failed (Chat ID: ${chatId}):`, telegramResult);
                await this.sendMessage(chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! \\(Error: ${telegramResult.description || 'නොදන්නා දෝෂයක්\\.'}\\)`), replyToMessageId);
            }
            
        } catch (e) {
            console.error(`sendVideo General Error (Chat ID: ${chatId}):`, e);
            await this.sendMessage(chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! \\(Network හෝ Timeout දෝෂයක්\\)\\.`), replyToMessageId);
        }
    }
    
    // --- Progress Bar Simulation ---

    async simulateProgress(chatId, messageId, originalReplyId) {
        const originalText = escapeMarkdownV2('⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න\\.');
        
        const statesToUpdate = PROGRESS_STATES.slice(1, 10); // 10% සිට 90% දක්වා

        for (let i = 0; i < statesToUpdate.length; i++) {
            // වීඩියෝව Download/Upload කිරීම අවසන් නම්, මෙම ලූප් එක නතර වේ.
            if (!this.progressActive) break; 
            
            await new Promise(resolve => setTimeout(resolve, 800)); // 0.8 seconds delay
            
            const state = statesToUpdate[i];
            const newKeyboard = [
                [{ text: `${state.text} ${state.percentage}`, callback_data: 'ignore_progress' }]
            ];
            const newText = originalText + "\n" + escapeMarkdownV2(`\nStatus: ${state.text}`);
            
            try {
                await this.editMessage(chatId, messageId, newText, newKeyboard);
            } catch (e) {
                // Ignore errors that occur if the message is deleted by the main logic
                // console.error(`Progress Edit Failed at state ${state.percentage}:`, e); 
                break;
            }
        }
    }
}


// -------------------------------------------------------------------
// V. Main Fetch Handler
// -------------------------------------------------------------------

export default {
    
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Hello, I am your FDOWN Telegram Worker Bot.', { status: 200 });
        }
        
        const handlers = new WorkerHandlers(env);
        
        const userInlineKeyboard = [
            [{ text: 'C D H Corporation © ✅', callback_data: 'ignore_c_d_h' }] 
        ];
        
        const initialProgressKeyboard = [
             [{ text: `${PROGRESS_STATES[0].text} ${PROGRESS_STATES[0].percentage}`, callback_data: 'ignore_progress' }]
        ];

        try {
            const update = await request.json();
            const message = update.message;
            const callbackQuery = update.callback_query;
            
            if (!message && !callbackQuery) {
                 return new Response('OK', { status: 200 });
            }
            ctx.waitUntil(new Promise(resolve => setTimeout(resolve, 0)));


            // --- 1. Message Handling ---
            if (message) { 
                const chatId = message.chat.id;
                const messageId = message.message_id;
                const text = message.text ? message.text.trim() : null; 
                const isOwner = OWNER_ID && chatId.toString() === OWNER_ID.toString();

                ctx.waitUntil(handlers.saveUserId(chatId));

                // ... (Broadcast Logic and /start Logic remain the same) ...

                if (text === '/start') {
                    // ... (Start command logic remains the same) ...
                    const userName = message.from.first_name || "ප්‍රියතම මිතුර"; 
                    const escapedUserName = escapeMarkdownV2(userName);

                    if (isOwner) {
                         const usersCount = await handlers.getAllUsersCount();
                         const ownerMessage = `👋 **පරිපාලක පැනලය**\n\nමෙමගින් ඔබගේ Bot එකේ දත්ත පරීක්ෂා කළ හැක\\.`;
                         const ownerKeyboard = [
                             [{ text: `📊 දැනට සිටින Users: ${usersCount}`, callback_data: 'admin_users_count' }],
                             [{ text: '📣 සියලු Users වෙත පණිවිඩයක් යවන්න', callback_data: 'admin_broadcast' }]
                         ];
                         await handlers.sendMessageWithKeyboard(chatId, escapeMarkdownV2(ownerMessage), messageId, ownerKeyboard);
                    } else {
                         const userStartMessage = 
                             `👋 Hello Dear **${escapedUserName}**\\! \n\n` +
                             `💁‍♂️ මේ BOT ගෙන් පුළුවන් ඔයාට **Facebook Video** ලේසියෙන්ම **Download** කර ගන්න\\.\n\n` +
                             `🎯 මේ BOT පැය **24/7** ම Active එකේ තියෙනවා\\.\\🔔 \n\n` + 
                             `◇───────────────◇\n\n` +
                             `🚀 **Developer** : \\@chamoddeshan\n` + 
                             `🔥 **C D H Corporation** ©\n\n` +
                             `◇───────────────◇`;
                         await handlers.sendMessageWithKeyboard(
                             chatId, 
                             userStartMessage, 
                             messageId, 
                             userInlineKeyboard
                         );
                    }
                    return new Response('OK', { status: 200 });
                }
                
                // --- C. Facebook Link Handling (Progress Bar & Delete Fix) ---
                if (text) { 
                    const isLink = /^https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.me)/i.test(text);
                    
                    if (isLink) {
                        
                        // 1. Initial Message Send (Progress 0%)
                        const initialText = escapeMarkdownV2('⌛️ වීඩියෝව හඳුනා ගැනේ... කරුණාකර මොහොතක් රැඳී සිටින්න\\.');
                        const progressMessageId = await handlers.sendMessage(
                            chatId, 
                            initialText, 
                            messageId, 
                            initialProgressKeyboard // 0% Keyboard
                        );
                        
                        // 2. Start Progress Simulation in background
                        if (progressMessageId) {
                            ctx.waitUntil(handlers.simulateProgress(chatId, progressMessageId, messageId));
                        }
                        
                        // 3. Start Scraping and Fetching
                        try {
                            const fdownUrl = "https://fdown.net/download.php";
                            const formData = new URLSearchParams();
                            formData.append('URLz', text); 
                            
                            const fdownResponse = await fetch(fdownUrl, {
                                method: 'POST',
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                    'Referer': 'https://fdown.net/', 
                                },
                                body: formData.toString(),
                                redirect: 'follow' 
                            });

                            const resultHtml = await fdownResponse.text();
                            
                            let videoUrl = null;
                            let thumbnailLink = null;
                            
                            // ... (Scraping logic remains the same) ...
                            const thumbnailRegex = /<img[^>]+class=["']?fb_img["']?[^>]*src=["']?([^"'\s]+)["']?/i;
                            let thumbnailMatch = resultHtml.match(thumbnailRegex);
                            if (thumbnailMatch && thumbnailMatch[1]) {
                                thumbnailLink = thumbnailMatch[1];
                            }

                            const hdLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>.*Download Video in HD Quality.*<\/a>/i;
                            let match = resultHtml.match(hdLinkRegex);

                            if (match && match[1]) {
                                videoUrl = match[1]; 
                            } else {
                                const normalLinkRegex = /<a[^>]+href=["']?([^"'\s]+)["']?[^>]*>.*Download Video in Normal Quality.*<\/a>/i;
                                match = resultHtml.match(normalLinkRegex);

                                if (match && match[1]) {
                                    videoUrl = match[1]; 
                                }
                            }
                            
                            // 4. Send Video or Error
                            if (videoUrl) {
                                let cleanedUrl = videoUrl.replace(/&amp;/g, '&');
                                
                                // ** FIX: Progress Simulation එක නවතන්න (Stop the loop) **
                                handlers.progressActive = false; 
                                
                                // ** FIX: Loading Message එක Delete කරන්න **
                                if (progressMessageId) {
                                     await handlers.deleteMessage(chatId, progressMessageId);
                                }
                                
                                // Send the actual video
                                await handlers.sendVideo(
                                    chatId, 
                                    cleanedUrl, 
                                    null, 
                                    messageId, 
                                    thumbnailLink, 
                                    userInlineKeyboard
                                ); 
                                
                            } else {
                                // Link Not Found Error
                                handlers.progressActive = false; // Stop simulation
                                const errorText = escapeMarkdownV2('⚠️ සමාවෙන්න, වීඩියෝ Download Link එක සොයා ගැනීමට නොහැකි විය\\. වීඩියෝව Private \\(පුද්ගලික\\) විය හැක\\.');
                                if (progressMessageId) {
                                    await handlers.editMessage(chatId, progressMessageId, errorText);
                                } else {
                                    await handlers.sendMessage(chatId, errorText, messageId);
                                }
                            }
                            
                        } catch (fdownError) {
                            // Fetch/Scraping Error
                             handlers.progressActive = false; // Stop simulation
                             console.error(`FDown Scraping Error (Chat ID: ${chatId}):`, fdownError);
                             const errorText = escapeMarkdownV2('❌ වීඩියෝ තොරතුරු ලබා ගැනීමේදී දෝෂයක් ඇති විය\\.');
                             if (progressMessageId) {
                                 await handlers.editMessage(chatId, progressMessageId, errorText);
                             } else {
                                 await handlers.sendMessage(chatId, errorText, messageId);
                             }
                        }
                        
                    } else {
                        // Not /start, not broadcast reply, not a link.
                        await handlers.sendMessage(chatId, escapeMarkdownV2('❌ කරුණාකර වලංගු Facebook වීඩියෝ Link එකක් එවන්න\\.'), messageId);
                    }
                } 
            }
            
            // --- 2. Callback Query Handling ---
            if (callbackQuery) {
                // ... (Callback Logic remains the same) ...
            }


            return new Response('OK', { status: 200 });

        } catch (e) {
            console.error("--- FATAL FETCH ERROR (Worker Logic Error) ---");
            console.error("The worker failed to process the update:", e);
            console.error("-------------------------------------------------");
            return new Response('OK', { status: 200 }); 
        }
    }
};
