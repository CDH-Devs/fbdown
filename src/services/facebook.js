/**
 * Fetches Facebook video information using Cloudflare-compatible methods
 * This is a replacement for fb-downloader-scrapper that works in Workers environment
 */
export async function getFbVideoInfo(videoUrl) {
  try {
    console.log(`Fetching video info for: ${videoUrl}`);
    
    // Use a third-party API that's compatible with Cloudflare Workers
    // Option 1: Use FBDownloader API
    const apiUrl = `https://www.fbdownloader.com/api/video?url=${encodeURIComponent(videoUrl)}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.video) {
      return {
        url: videoUrl,
        sd: data.video.sd || data.video.url,
        hd: data.video.hd || data.video.url,
        title: data.video.title || 'Facebook Video',
        thumbnail: data.video.thumbnail || ''
      };
    }
    
    // Fallback: Try alternative API
    return await getFbVideoInfoFallback(videoUrl);
    
  } catch (error) {
    console.error('Primary API error:', error.message);
    
    // Try fallback method
    try {
      return await getFbVideoInfoFallback(videoUrl);
    } catch (fallbackError) {
      console.error('Fallback API error:', fallbackError.message);
      return { error: 'Unable to fetch video. Please check the URL and try again.' };
    }
  }
}

/**
 * Fallback method using alternative API
 */
async function getFbVideoInfoFallback(videoUrl) {
  try {
    // Use SnapSave API as fallback
    const apiUrl = `https://snapsave.app/api/ajaxSearch`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: `q=${encodeURIComponent(videoUrl)}&vt=facebook`
    });
    
    if (!response.ok) {
      throw new Error(`Fallback API failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'ok' && data.data) {
      // Parse HTML response to extract video URLs
      const htmlContent = data.data;
      
      // Extract HD and SD links from the HTML
      const hdMatch = htmlContent.match(/href="([^"]+)"[^>]*>\s*Download\s+HD/i);
      const sdMatch = htmlContent.match(/href="([^"]+)"[^>]*>\s*Download\s+SD/i);
      
      if (hdMatch || sdMatch) {
        return {
          url: videoUrl,
          sd: sdMatch ? sdMatch[1] : hdMatch ? hdMatch[1] : null,
          hd: hdMatch ? hdMatch[1] : null,
          title: 'Facebook Video',
          thumbnail: ''
        };
      }
    }
    
    throw new Error('No video links found in response');
    
  } catch (error) {
    throw new Error(`Fallback method failed: ${error.message}`);
  }
}
