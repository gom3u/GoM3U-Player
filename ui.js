/**
 * UI Renderer with Virtualized Channel List for 100k+ Support
 */
class UIController {
  constructor() {
    this.itemHeight = 54; // Match CSS height for .channel-card
    this.visibleChannels = [];
    this.favorites = new Set();
    this.recentList = [];
    this.activeChannel = null;

    this.container = document.getElementById('virtual-channel-list');
    this.spacer = document.getElementById('virtual-spacer');
    this.content = document.getElementById('virtual-content');

    this.initVirtualScroll();
  }

  initVirtualScroll() {
    this.container.addEventListener('scroll', () => this.renderVirtualList());
  }

  setChannels(channels) {
    this.visibleChannels = channels;
    this.spacer.style.height = `${channels.length * this.itemHeight}px`;
    this.renderVirtualList();
  }

  renderVirtualList() {
    const scrollTop = this.container.scrollTop;
    const viewportHeight = this.container.clientHeight;

    const startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - 5);
    const endIndex = Math.min(
      this.visibleChannels.length,
      Math.ceil((scrollTop + viewportHeight) / this.itemHeight) + 5
    );

    this.content.style.transform = `translateY(${startIndex * this.itemHeight}px)`;
    this.content.innerHTML = '';

    for (let i = startIndex; i < endIndex; i++) {
      const channel = this.visibleChannels[i];
      const node = this.createChannelNode(channel);
      this.content.appendChild(node);
    }
  }

  createChannelNode(channel) {
    const div = document.createElement('div');
    div.className = `channel-card ${this.activeChannel?.id === channel.id ? 'active' : ''}`;
    div.dataset.id = channel.id;

    const isFav = this.favorites.has(channel.id);
    const fallbackLogo = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%2394a3b8' d='M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z'/%3E%3C/svg%3E";

    div.innerHTML = `
      <img class="channel-logo" src="${channel.logo || fallbackLogo}" onerror="this.src='${fallbackLogo}'" loading="lazy" />
      <div class="channel-info">
        <div class="channel-name">${this.escapeHtml(channel.name)}</div>
        <div class="channel-group">${this.escapeHtml(channel.group)}</div>
      </div>
      <button class="fav-btn ${isFav ? 'active' : ''}">★</button>
    `;

    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('fav-btn')) {
        e.stopPropagation();
        window.app.toggleFavorite(channel);
      } else {
        window.app.playChannel(channel);
      }
    });

    return div;
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3500);
  }

  escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }
}

window.ui = new UIController();
