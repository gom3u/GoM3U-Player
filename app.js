/**
 * Main Application Orchestration Module
 */
class App {
  constructor() {
    this.playlists = [];
    this.activePlaylist = null;
    this.allChannels = [];
    this.filteredChannels = [];
    this.player = null;

    this.filters = {
      search: '',
      group: 'ALL',
      sort: 'default',
      favoritesOnly: false,
      recentOnly: false
    };
  }

  async init() {
    await window.appStorage.init();
    this.player = new VideoPlayer('video-player');

    this.bindEvents();
    await this.loadSettings();
    await this.loadPlaylists();
    await this.loadState();

    // Register Service Worker for PWA Offline Support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(err => {
        console.warn('SW registration failed: ', err);
      });
    }
  }

  async loadSettings() {
    const savedTheme = await window.appStorage.get('settings', 'theme');
    if (savedTheme) {
      document.body.setAttribute('data-theme', savedTheme);
      document.getElementById('theme-select').value = savedTheme;
    }
    
    const bufferSize = await window.appStorage.get('settings', 'bufferSize');
    if (bufferSize) {
      document.getElementById('buffer-size').value = bufferSize;
      window.appSettings = { bufferSize };
    }
  }

  async loadPlaylists() {
    this.playlists = await window.appStorage.getAll('playlists');
    this.renderPlaylistList();

    if (this.playlists.length > 0) {
      // Auto Load First Playlist or Saved Active
      const activeId = await window.appStorage.get('settings', 'activePlaylistId');
      const target = this.playlists.find(p => p.id === activeId) || this.playlists[0];
      this.selectPlaylist(target.id);
    }
  }

  async selectPlaylist(id) {
    const playlist = this.playlists.find(p => p.id === id);
    if (!playlist) return;

    this.activePlaylist = playlist;
    await window.appStorage.set('settings', 'activePlaylistId', id);

    // Auto Sync if URL
    if (playlist.type === 'url') {
      try {
        window.ui.showToast('Refreshing playlist from source...', 'info');
        const res = await fetch(playlist.source);
        const text = await res.text();
        playlist.channels = PlaylistParser.parse(text);
        playlist.lastUpdated = new Date().toISOString();
        await window.appStorage.set('playlists', playlist.id, playlist);
      } catch (err) {
        window.ui.showToast('Sync failed. Using cached list.', 'warning');
      }
    }

    this.allChannels = playlist.channels || [];
    this.updateGroupDropdown();
    this.applyFilters();
  }

  applyFilters() {
    let list = [...this.allChannels];

    if (this.filters.search) {
      const q = this.filters.search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
    }

    if (this.filters.group !== 'ALL') {
      list = list.filter(c => c.group === this.filters.group);
    }

    if (this.filters.favoritesOnly) {
      list = list.filter(c => window.ui.favorites.has(c.id));
    }

    if (this.filters.recentOnly) {
      list = list.filter(c => window.ui.recentList.includes(c.id));
    }

    if (this.filters.sort === 'az') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (this.filters.sort === 'za') {
      list.sort((a, b) => b.name.localeCompare(a.name));
    }

    this.filteredChannels = list;
    window.ui.setChannels(list);
  }

  updateGroupDropdown() {
    const dropdown = document.getElementById('group-filter');
    dropdown.innerHTML = '<option value="ALL">All Groups</option>';

    const groups = new Set(this.allChannels.map(c => c.group));
    groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      dropdown.appendChild(opt);
    });
  }

  async playChannel(channel) {
    window.ui.activeChannel = channel;
    document.getElementById('playing-title').textContent = channel.name;
    this.player.loadStream(channel.url, channel);

    // Track Recently Watched
    if (!window.ui.recentList.includes(channel.id)) {
      window.ui.recentList.unshift(channel.id);
      if (window.ui.recentList.length > 50) window.ui.recentList.pop();
      await window.appStorage.set('settings', 'recentList', window.ui.recentList);
    }

    await window.appStorage.set('settings', 'lastChannel', channel);
    window.ui.renderVirtualList();
  }

  async toggleFavorite(channel) {
    if (window.ui.favorites.has(channel.id)) {
      window.ui.favorites.delete(channel.id);
    } else {
      window.ui.favorites.add(channel.id);
    }

    await window.appStorage.set('settings', 'favorites', Array.from(window.ui.favorites));
    window.ui.renderVirtualList();
  }

  async loadState() {
    const favs = await window.appStorage.get('settings', 'favorites');
    if (favs) window.ui.favorites = new Set(favs);

    const recents = await window.appStorage.get('settings', 'recentList');
    if (recents) window.ui.recentList = recents;

    const lastChan = await window.appStorage.get('settings', 'lastChannel');
    if (lastChan) {
      this.playChannel(lastChan);
    }
  }

  renderPlaylistList() {
    const container = document.getElementById('playlists-list');
    container.innerHTML = '';

    this.playlists.forEach(p => {
      const card = document.createElement('div');
      card.className = 'channel-card';
      card.style.justifyContent = 'space-between';
      card.innerHTML = `
        <div>
          <div class="channel-name">${window.ui.escapeHtml(p.name)}</div>
          <div class="channel-group">${p.channels?.length || 0} Channels</div>
        </div>
        <button class="btn danger-btn" style="padding:4px 8px;">Delete</button>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
          e.stopPropagation();
          this.deletePlaylist(p.id);
        } else {
          this.selectPlaylist(p.id);
        }
      });

      container.appendChild(card);
    });
  }

  async deletePlaylist(id) {
    await window.appStorage.remove('playlists', id);
    window.ui.showToast('Playlist deleted.', 'info');
    await this.loadPlaylists();
  }

  bindEvents() {
    // Sidebar Tabs Switcher
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        e.target.classList.add('active');
        document.getElementById(`view-${e.target.dataset.tab}`).classList.add('active');
      });
    });

    // Toggle Sidebar
    document.getElementById('toggle-sidebar-btn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('collapsed');
    });

    // Filtering inputs
    document.getElementById('channel-search').addEventListener('input', (e) => {
      this.filters.search = e.target.value;
      this.applyFilters();
    });

    document.getElementById('group-filter').addEventListener('change', (e) => {
      this.filters.group = e.target.value;
      this.applyFilters();
    });

    document.getElementById('sort-filter').addEventListener('change', (e) => {
      this.filters.sort = e.target.value;
      this.applyFilters();
    });

    document.getElementById('filter-favs').addEventListener('click', (e) => {
      e.target.classList.toggle('active');
      this.filters.favoritesOnly = e.target.classList.contains('active');
      this.applyFilters();
    });

    document.getElementById('filter-recent').addEventListener('click', (e) => {
      e.target.classList.toggle('active');
      this.filters.recentOnly = e.target.classList.contains('active');
      this.applyFilters();
    });

    // Player Controls
    document.getElementById('btn-play-pause').addEventListener('click', () => this.player.togglePlay());
    document.getElementById('btn-play').addEventListener('click', () => this.player.play());
    document.getElementById('btn-stop').addEventListener('click', () => this.player.pause());
    document.getElementById('btn-reload').addEventListener('click', () => {
      if (this.player.currentChannel) this.player.loadStream(this.player.currentChannel.url, this.player.currentChannel);
    });
    document.getElementById('btn-mute').addEventListener('click', () => this.player.toggleMute());
    document.getElementById('volume-slider').addEventListener('input', (e) => this.player.setVolume(e.target.value));
    document.getElementById('btn-fullscreen').addEventListener('click', () => this.player.toggleFullscreen());
    document.getElementById('btn-pip').addEventListener('click', () => this.player.togglePiP());

    // Modal Control
    const modal = document.getElementById('modal-add-playlist');
    document.getElementById('open-add-modal').addEventListener('click', () => modal.classList.remove('hidden'));
    document.getElementById('close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));

    // Modal Tab Selector
    document.querySelectorAll('.modal-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
        
        e.target.classList.add('active');
        document.getElementById(`input-type-${e.target.dataset.type}`).classList.add('active');
      });
    });

    // Save Playlist Processing
    document.getElementById('save-playlist-btn').addEventListener('click', async () => {
      const name = document.getElementById('playlist-name-input').value.trim() || 'New Playlist';
      const type = document.querySelector('.modal-tab.active').dataset.type;

      let channels = [];
      let source = '';

      if (type === 'url') {
        source = document.getElementById('playlist-url-input').value.trim();
        if (!source) return window.ui.showToast('Please provide a valid URL', 'error');

        try {
          window.ui.showToast('Downloading playlist...', 'info');
          const res = await fetch(source);
          const text = await res.text();
          channels = PlaylistParser.parse(text);
        } catch (err) {
          return window.ui.showToast('Failed to fetch M3U from URL.', 'error');
        }
      } else {
        const fileInput = document.getElementById('playlist-file-input');
        if (!fileInput.files.length) return window.ui.showToast('Please select a file', 'error');

        const file = fileInput.files[0];
        source = file.name;
        const text = await file.text();
        channels = PlaylistParser.parse(text);
      }

      const newPlaylist = {
        id: 'pl_' + Date.now(),
        name,
        type,
        source,
        channels,
        lastUpdated: new Date().toISOString()
      };

      await window.appStorage.set('playlists', newPlaylist.id, newPlaylist);
      window.ui.showToast(`Saved ${channels.length} channels!`, 'success');
      modal.classList.add('hidden');
      
      await this.loadPlaylists();
      this.selectPlaylist(newPlaylist.id);
    });

    // Settings
    document.getElementById('theme-select').addEventListener('change', async (e) => {
      const val = e.target.value;
      document.body.setAttribute('data-theme', val);
      await window.appStorage.set('settings', 'theme', val);
    });

    document.getElementById('buffer-size').addEventListener('change', async (e) => {
      await window.appStorage.set('settings', 'bufferSize', e.target.value);
      window.appSettings = window.appSettings || {};
      window.appSettings.bufferSize = e.target.value;
    });

    document.getElementById('clear-cache-btn').addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all app data?')) {
        await window.appStorage.clearAll();
        location.reload();
      }
    });

    // Keyboard TV Remote Controls
    document.addEventListener('keydown', (e) => {
      if (['input', 'select'].includes(document.activeElement.tagName.toLowerCase())) return;

      switch (e.key) {
        case ' ':
        case 'k':
          this.player.togglePlay();
          break;
        case 'f':
          this.player.toggleFullscreen();
          break;
        case 'm':
          this.player.toggleMute();
          break;
        case 'ArrowUp':
          this.navigateChannel(-1);
          break;
        case 'ArrowDown':
          this.navigateChannel(1);
          break;
      }
    });
  }

  navigateChannel(direction) {
    if (!this.filteredChannels.length) return;
    const currentIndex = this.filteredChannels.findIndex(c => c.id === window.ui.activeChannel?.id);
    let nextIndex = currentIndex + direction;

    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex >= this.filteredChannels.length) nextIndex = this.filteredChannels.length - 1;

    this.playChannel(this.filteredChannels[nextIndex]);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
// --- IPTV CONTROLS ENHANCEMENT MODULE ---

document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('iptvPlayer');
  const container = document.getElementById('playerContainer');
  const controlsOverlay = document.getElementById('controlsOverlay');
  const brightnessOverlay = document.getElementById('brightnessOverlay');

  const volumeSlider = document.getElementById('volumeSlider');
  const volumeVal = document.getElementById('volumeVal');
  const muteBtn = document.getElementById('muteBtn');

  const brightnessSlider = document.getElementById('brightnessSlider');
  const brightnessVal = document.getElementById('brightnessVal');
  const gestureIndicator = document.getElementById('gestureIndicator');

  let autoHideTimer = null;
  let lastVolume = 1;

  // ----------------------------------------------------
  // 1. CHANNEL NAVIGATION INTEGRATION
  // Connect these to your existing channel state variables/functions
  // ----------------------------------------------------
  window.currentChannelIndex = window.currentChannelIndex || 0;
  window.channelsArray = window.channelsArray || []; // Your existing array of channels

  function playChannelAtIndex(index) {
    if (!window.channelsArray || window.channelsArray.length === 0) return;
    
    // Wrap around boundaries
    if (index < 0) index = window.channelsArray.length - 1;
    if (index >= window.channelsArray.length) index = 0;

    window.currentChannelIndex = index;
    const channel = window.channelsArray[index];

    // If your app has an existing load/play function, invoke it here:
    if (typeof window.loadChannel === 'function') {
      window.loadChannel(channel);
    } else if (channel && channel.url) {
      video.src = channel.url;
      video.play().catch(() => {});
    }

    showIndicator(`📺 ${channel.name || 'Channel ' + (index + 1)}`);
  }

  function nextChannel() {
    playChannelAtIndex(window.currentChannelIndex + 1);
  }

  function prevChannel() {
    playChannelAtIndex(window.currentChannelIndex - 1);
  }

  function toggleChannelList() {
    const sidebar = document.getElementById('channelSidebar') || document.getElementById('playlist');
    if (sidebar) {
      sidebar.classList.toggle('open') || sidebar.classList.toggle('hidden');
    } else if (typeof window.toggleSidebar === 'function') {
      window.toggleSidebar();
    }
  }

  function refreshStream() {
    showIndicator("Refreshing Stream...");
    const currentSrc = video.src;
    video.src = '';
    video.src = currentSrc;
    video.load();
    video.play().catch(() => {});
  }

  // Event Listeners for UI Navigation Buttons
  document.getElementById('prevBtn')?.addEventListener('click', prevChannel);
  document.getElementById('nextBtn')?.addEventListener('click', nextChannel);
  document.getElementById('listToggleBtn')?.addEventListener('click', toggleChannelList);
  document.getElementById('refreshBtn')?.addEventListener('click', refreshStream);
  document.getElementById('homeBtn')?.addEventListener('click', () => window.location.href = '/');
  document.getElementById('backBtn')?.addEventListener('click', () => window.history.back());

  // ----------------------------------------------------
  // 2. VOLUME CONTROL & LOCALSTORAGE SAVING
  // ----------------------------------------------------
  function setVolume(val) {
    val = Math.max(0, Math.min(1, val));
    video.volume = val;
    video.muted = (val === 0);
    volumeSlider.value = val * 100;
    volumeVal.textContent = Math.round(val * 100) + '%';
    muteBtn.textContent = video.muted ? '🔇' : '🔊';
    localStorage.setItem('iptv_volume', val);
  }

  volumeSlider.addEventListener('input', (e) => setVolume(e.target.value / 100));

  muteBtn.addEventListener('click', () => {
    if (video.muted) {
      setVolume(lastVolume > 0 ? lastVolume : 1);
    } else {
      lastVolume = video.volume;
      setVolume(0);
    }
  });

  // ----------------------------------------------------
  // 3. BRIGHTNESS CONTROL (CSS Filter & Persistence)
  // ----------------------------------------------------
  function setBrightness(val) {
    val = Math.max(0, Math.min(100, val));
    const opacity = (100 - val) / 100; // 100% brightness = 0% darkness overlay
    brightnessOverlay.style.opacity = opacity;
    brightnessSlider.value = val;
    brightnessVal.textContent = val + '%';
    localStorage.setItem('iptv_brightness', val);
  }

  brightnessSlider.addEventListener('input', (e) => setBrightness(e.target.value));

  // Load Saved Settings
  const savedVol = localStorage.getItem('iptv_volume');
  if (savedVol !== null) setVolume(parseFloat(savedVol));

  const savedBright = localStorage.getItem('iptv_brightness');
  if (savedBright !== null) setBrightness(parseInt(savedBright));

  // ----------------------------------------------------
  // 4. FULLSCREEN & LANDSCAPE OPTIMIZATION
  // ----------------------------------------------------
  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await container.requestFullscreen().catch(err => console.log(err));
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } else {
      document.exitFullscreen();
    }
  }

  document.getElementById('fullscreenBtn')?.addEventListener('click', toggleFullscreen);
  video.addEventListener('dblclick', toggleFullscreen);

  // ----------------------------------------------------
  // 5. FLOATING CONTROLS (Auto-hide after 3s)
  // ----------------------------------------------------
  function resetAutoHideTimer() {
    controlsOverlay.classList.remove('hidden');
    clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(() => {
      if (!video.paused) {
        controlsOverlay.classList.add('hidden');
      }
    }, 3000);
  }

  ['mousemove', 'touchstart', 'keydown'].forEach(evt => {
    container.addEventListener(evt, resetAutoHideTimer);
  });

  // ----------------------------------------------------
  // 6. KEYBOARD SHORTCUTS & ANDROID TV REMOTE SUPPORT
  // ----------------------------------------------------
  window.addEventListener('keydown', (e) => {
    resetAutoHideTimer();
    switch (e.key) {
      case 'ArrowLeft':
        prevChannel();
        break;
      case 'ArrowRight':
        nextChannel();
        break;
      case 'ArrowUp':
        setVolume(video.volume + 0.05);
        showIndicator(`🔊 ${Math.round(video.volume * 100)}%`);
        break;
      case 'ArrowDown':
        setVolume(video.volume - 0.05);
        showIndicator(`🔊 ${Math.round(video.volume * 100)}%`);
        break;
      case 'b': case 'B':
        setBrightness(parseInt(brightnessSlider.value) + 5);
        showIndicator(`☀️ ${brightnessSlider.value}%`);
        break;
      case 'n': case 'N':
        setBrightness(parseInt(brightnessSlider.value) - 5);
        showIndicator(`☀️ ${brightnessSlider.value}%`);
        break;
      case 'f': case 'F':
        toggleFullscreen();
        break;
      case 'm': case 'M':
        muteBtn.click();
        break;
      case ' ':
        e.preventDefault();
        video.paused ? video.play() : video.pause();
        break;
      case 'Enter':
      case 'Select':
        if (controlsOverlay.classList.contains('hidden')) {
          resetAutoHideTimer();
        }
        break;
      case 'Backspace':
      case 'GoBack':
        window.history.back();
        break;
    }
  });

  // ----------------------------------------------------
  // 7. MOBILE SWIPE & GESTURE CONTROLS
  // ----------------------------------------------------
  let touchStartX = 0;
  let touchStartY = 0;
  let lastTapTime = 0;

  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;

      // Double Tap Play/Pause
      const now = Date.now();
      if (now - lastTapTime < 300) {
        video.paused ? video.play() : video.pause();
      }
      lastTapTime = now;
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;

    const deltaX = e.touches[0].clientX - touchStartX;
    const deltaY = touchStartY - e.touches[0].clientY; // Inverted Y-axis
    const screenWidth = window.innerWidth;

    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 20) {
      if (touchStartX < screenWidth / 2) {
        // Left side vertical swipe -> Brightness
        const change = Math.round(deltaY / 6);
        setBrightness(parseInt(brightnessSlider.value) + change);
        showIndicator(`☀️ ${brightnessSlider.value}%`);
      } else {
        // Right side vertical swipe -> Volume
        const change = deltaY / 600;
        setVolume(video.volume + change);
        showIndicator(`🔊 ${Math.round(video.volume * 100)}%`);
      }
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(deltaX) > 120) {
      // Horizontal swipe -> Previous / Next Channel
      deltaX > 0 ? prevChannel() : nextChannel();
    }
  });

  // Helper Toast Feedback
  let indicatorTimer;
  function showIndicator(text) {
    gestureIndicator.textContent = text;
    gestureIndicator.classList.add('active');
    clearTimeout(indicatorTimer);
    indicatorTimer = setTimeout(() => gestureIndicator.classList.remove('active'), 1200);
  }

  // Initial call
  resetAutoHideTimer();
});
