async function fetchWithTimeout(handler, videoUrl, apiKey = null, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const result = apiKey 
      ? await handler(videoUrl, apiKey, controller.signal)
      : await handler(videoUrl, controller.signal);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

export async function getFbVideoInfo(videoUrl, env) {
  console.log(`Fetching video info for: ${videoUrl}`);
  
  // Primary: RapidAPI if API key is available
  if (env?.RAPIDAPI_KEY) {
    try {
      console.log('Trying RapidAPI (Primary)...');
      const result = await fetchWithTimeout(tryRapidAPI, videoUrl, env.RAPIDAPI_KEY, 15000);
      if (result && (result.hd || result.sd)) {
        console.log('Success with RapidAPI');
        return result;
      }
    } catch (error) {
      console.error('RapidAPI failed:', error.message);
    }
  }
  
  // Fallback: Free scraping APIs with improved handling
  const apis = [
    { name: 'SnapSave', handler: trySnapSaveAPI },
    { name: 'FBDown', handler: tryFBDownAPI },
    { name: 'FDown', handler: tryFDownAPI },
    { name: 'Direct', handler: tryDirectMethod }
  ];
  
  for (const api of apis) {
    try {
      console.log(`Trying ${api.name} API...`);
      const result = await fetchWithTimeout(api.handler, videoUrl, null, 15000);
      
      if (result && (result.hd || result.sd)) {
        console.log(`Success with ${api.name} API`);
        return result;
      }
    } catch (error) {
      console.error(`${api.name} API failed:`, error.message);
    }
  }
  
  return { 
    error: 'Unable to fetch video. The video might be private, deleted, or temporarily unavailable.' 
  };
}

/**
 * Primary Method: RapidAPI (requires API key)
 */
async function tryRapidAPI(videoUrl, apiKey, signal) {
  const apiUrl = 'https://facebook-reel-and-video-downloader.p.rapidapi.com/app/main.php';
  
  const formData = new URLSearchParams();
  formData.append('url', videoUrl);
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': 'facebook-reel-and-video-downloader.p.rapidapi.com'
    },
    body: formData.toString(),
    signal
  });
  
  if (!response.ok) {
    throw new Error(`RapidAPI failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.links && data.links.length > 0) {
    const hdLink = data.links.find(link => link.quality === 'HD' || link.quality === 'hd');
    const sdLink = data.links.find(link => link.quality === 'SD' || link.quality === 'sd');
    const anyLink = data.links[0];
    
    return {
      url: videoUrl,
      hd: hdLink?.link || anyLink?.link || null,
      sd: sdLink?.link || anyLink?.link || null,
      title: data.title || 'Facebook Video',
      thumbnail: data.thumbnail || ''
    };
  }
  
  throw new Error('No video links in RapidAPI response');
}

/**
 * Fallback 1: SnapSave API
 */
async function trySnapSaveAPI(videoUrl, signal) {
  const apiUrl = 'https://snapsave.app/action.php?lang=vn';
  
  const formData = new URLSearchParams();
  formData.append('url', videoUrl);
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
      'Origin': 'https://snapsave.app',
      'Referer': 'https://snapsave.app/'
    },
    body: formData.toString(),
    signal
  });
  
  if (!response.ok) {
    throw new Error(`SnapSave API failed: ${response.status}`);
  }
  
  const html = await response.text();
  
  // Extract video URLs using updated patterns
  const hdMatch = html.match(/href="([^"]+)"[^>]*>\s*Download\s+HD/i) || 
                  html.match(/"(https?:\/\/[^"]+\.mp4[^"]*hd[^"]*)"/i);
  const sdMatch = html.match(/href="([^"]+)"[^>]*>\s*Download\s+SD/i) ||
                  html.match(/"(https?:\/\/[^"]+\.mp4[^"]*)"/i);
  
  if (hdMatch || sdMatch) {
    return {
      url: videoUrl,
      hd: hdMatch ? hdMatch[1] : null,
      sd: sdMatch ? sdMatch[1] : (hdMatch ? hdMatch[1] : null),
      title: 'Facebook Video',
      thumbnail: ''
    };
  }
  
  throw new Error('No video URLs found');
}

/**
 * Fallback 2: FBDown.org API
 */
async function tryFBDownAPI(videoUrl, signal) {
  const apiUrl = 'https://fbdown.org/download.php';
  
  const formData = new URLSearchParams();
  formData.append('URLz', videoUrl);
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    body: formData.toString(),
    signal
  });
  
  if (!response.ok) {
    throw new Error(`FBDown API failed: ${response.status}`);
  }
  
  const html = await response.text();
  
  // Look for download buttons with various patterns
  const hdMatch = html.match(/href=["'](https?:\/\/[^"']+)["'][^>]*>\s*(?:Download|HD|High)/i);
  const sdMatch = html.match(/href=["'](https?:\/\/[^"']+)["'][^>]*>\s*(?:Download|SD|Normal)/i);
  
  if (hdMatch || sdMatch) {
    return {
      url: videoUrl,
      hd: hdMatch ? hdMatch[1] : null,
      sd: sdMatch ? sdMatch[1] : (hdMatch ? hdMatch[1] : null),
      title: 'Facebook Video',
      thumbnail: ''
    };
  }
  
  throw new Error('No video URLs found');
}

/**
 * Fallback 3: FDown.net API
 */
async function tryFDownAPI(videoUrl, signal) {
  const apiUrl = 'https://www.fdown.net/download.php';
  
  const formData = new URLSearchParams();
  formData.append('URLz', videoUrl);
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://www.fdown.net/'
    },
    body: formData.toString(),
    signal
  });
  
  if (!response.ok) {
    throw new Error(`FDown API failed: ${response.status}`);
  }
  
  const html = await response.text();
  
  // Multiple pattern matching for better reliability
  const patterns = [
    /href=["'](https?:\/\/[^"']+)["'][^>]*>\s*Download\s+High\s+Quality/i,
    /href=["'](https?:\/\/[^"']+)["'][^>]*>\s*Download\s+HD/i,
    /<a[^>]+download[^>]+href=["'](https?:\/\/[^"']+\.mp4[^"']*hd[^"']*)["']/i
  ];
  
  let hdMatch = null;
  for (const pattern of patterns) {
    hdMatch = html.match(pattern);
    if (hdMatch) break;
  }
  
  const sdPatterns = [
    /href=["'](https?:\/\/[^"']+)["'][^>]*>\s*Download\s+(?:Normal|Standard|Low)\s+Quality/i,
    /href=["'](https?:\/\/[^"']+)["'][^>]*>\s*Download\s+SD/i,
    /<a[^>]+download[^>]+href=["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i
  ];
  
  let sdMatch = null;
  for (const pattern of sdPatterns) {
    sdMatch = html.match(pattern);
    if (sdMatch) break;
  }
  
  if (hdMatch || sdMatch) {
    return {
      url: videoUrl,
      hd: hdMatch ? hdMatch[1] : null,
      sd: sdMatch ? sdMatch[1] : (hdMatch ? hdMatch[1] : null),
      title: 'Facebook Video',
      thumbnail: ''
    };
  }
  
  throw new Error('No video URLs found in response');
}

/**
 * Fallback 4: Direct extraction (last resort)
 */
async function tryDirectMethod(videoUrl, signal) {
  // Try to fetch the Facebook page directly
  const response = await fetch(videoUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    signal
  });
  
  if (!response.ok) {
    throw new Error(`Direct fetch failed: ${response.status}`);
  }
  
  const html = await response.text();
  
  // Look for video URLs in page source (Facebook embeds them)
  const hdMatch = html.match(/"playable_url_quality_hd":"(https?:[^"]+)"/);
  const sdMatch = html.match(/"playable_url":"(https?:[^"]+)"/);
  
  if (hdMatch || sdMatch) {
    const decodeUrl = (url) => url.replace(/\\u0025/g, '%').replace(/\\\//g, '/');
    
    return {
      url: videoUrl,
      hd: hdMatch ? decodeUrl(hdMatch[1]) : null,
      sd: sdMatch ? decodeUrl(sdMatch[1]) : (hdMatch ? decodeUrl(hdMatch[1]) : null),
      title: 'Facebook Video',
      thumbnail: ''
    };
  }
  
  throw new Error('No video URLs found in page source');
}
