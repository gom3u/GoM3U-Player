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
