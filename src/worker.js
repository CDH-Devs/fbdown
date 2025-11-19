// ... (Functions and Message Handling sections remain the same)

// ------------------------------------
// සහායක Functions (Auxiliary Functions)
// ------------------------------------

// ... (sendMessage and other functions remain the same)

async sendVideo(api, chatId, videoUrl, caption = null, replyToMessageId, thumbnailLink = null, replyMarkup = null) {
    
    // 1. Video URL එක fetch කරයි
    const videoResponse = await fetch(videoUrl);
    
    if (videoResponse.status !== 200) {
        // Log: fdown.net වෙතින් ලැබුණු Video Link එක fetch කිරීමට අසාර්ථකයි
        console.error(`[VIDEO FETCH ERROR] Failed to fetch video from CDN. Status: ${videoResponse.status}, URL: ${videoUrl}`);
        await this.sendMessage(api, chatId, escapeMarkdownV2(`⚠️ වීඩියෝව කෙලින්ම Upload කිරීමට අසාර්ථකයි\\. CDN වෙත පිවිසීමට නොහැක\\.\\n*Link:* ${escapeMarkdownV2(videoUrl)}`), replyToMessageId);
        return;
    }
    
    const videoBlob = await videoResponse.blob();
    
    // V20 FIX: 2. Blob එකෙහි ප්‍රමාණය පරීක්ෂා කිරීම
    if (videoBlob.size === 0) {
        console.error(`[VIDEO BLOB ERROR] Fetched video blob size is 0 bytes for URL: ${videoUrl}`);
        await this.sendMessage(api, chatId, escapeMarkdownV2(`⚠️ සමාවෙන්න, ලබා ගත් වීඩියෝ ගොනුව හිස්ය\\. කරුණාකර වෙනත් වීඩියෝවක් උත්සාහ කරන්න\\.`));
        return; 
    }
    
    const formData = new FormData();
    formData.append('chat_id', chatId);
    
    if (caption) {
        formData.append('caption', caption);
        formData.append('parse_mode', 'MarkdownV2');
    }
    
    if (replyToMessageId) {
        formData.append('reply_to_message_id', replyToMessageId);
    }
    
    if (replyMarkup) {
        formData.append('reply_markup', JSON.stringify(replyMarkup));
    }

    // 3. Blob එක 'video' ලෙස append කරයි
    formData.append('video', videoBlob, 'video.mp4'); 
    
    // ... (Thumbnail handling remains the same)

    try {
        const telegramResponse = await fetch(`${api}/sendVideo`, {
            method: 'POST',
            body: formData,
        });
        
        if (!telegramResponse.ok) {
            const telegramResult = await telegramResponse.json();
            console.error(`[TELEGRAM API ERROR] sendVideo failed: ${telegramResult.description}`); // Log the Telegram error
            // Error Message to User
            await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Error: ${escapeMarkdownV2(telegramResult.description || 'නොදන්නා දෝෂයක්\\.')})`), replyToMessageId);
        }
        
    } catch (e) {
        console.error(`[TELEGRAM API ERROR] sendVideo network failed: ${e.stack}`); // Log the network error
        await this.sendMessage(api, chatId, escapeMarkdownV2(`❌ වීඩියෝව යැවීම අසාර්ථකයි! (Network හෝ Timeout දෝෂයක්)\\.`), replyToMessageId);
    }
}

// ... (sendAudio and answerCallbackQuery remain the same)
