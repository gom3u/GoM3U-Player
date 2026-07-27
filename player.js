/**
 * Dynamic HLS Player Controller with Recovery Mechanism
 */
class VideoPlayer {
  constructor(videoElementId) {
    this.video = document.getElementById(videoElementId);
    this.hls = null;
    this.currentChannel = null;
    this.retryAttempts = 0;
    this.maxRetries = 3;

    this.initListeners();
  }

  initListeners() {
    this.video.addEventListener('error', () => this.handleError());
  }

  loadStream(url, channelInfo = null) {
    this.currentChannel = channelInfo;
    this.retryAttempts = 0;

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    if (Hls.isSupported()) {
      const config = {
        maxBufferLength: parseInt(window.appSettings?.bufferSize || 30, 10),
        enableWorker: true,
        lowLatencyMode: true
      };

      this.hls = new Hls(config);
      this.hls.loadSource(url);
      this.hls.attachMedia(this.video);

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.video.play().catch(e => console.warn("Autoplay blocked:", e));
        this.updateQualityTracks();
        this.updateAudioTracks();
      });

      this.hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error("HLS Network Error, attempting recovery...");
              this.hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error("HLS Media Error, recovering...");
              this.hls.recoverMediaError();
              break;
            default:
              this.handleError();
              break;
          }
        }
      });
    } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS fallback (Safari / iOS)
      this.video.src = url;
      this.video.addEventListener('loadedmetadata', () => {
        this.video.play();
      });
    } else {
      window.ui.showToast('HLS Playback is not supported in this browser.', 'error');
    }
  }

  handleError() {
    if (this.retryAttempts < this.maxRetries) {
      this.retryAttempts++;
      window.ui.showToast(`Playback Error. Retrying (${this.retryAttempts}/${this.maxRetries})...`, 'warning');
      setTimeout(() => {
        if (this.currentChannel) this.loadStream(this.currentChannel.url, this.currentChannel);
      }, 2000);
    } else {
      window.ui.showToast('Failed to load stream after multiple retries.', 'error');
    }
  }

  play() { this.video.play(); }
  pause() { this.video.pause(); }
  togglePlay() { this.video.paused ? this.play() : this.pause(); }
  
  setVolume(level) { this.video.volume = level; }
  toggleMute() { this.video.muted = !this.video.muted; }
  
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  }

  togglePiP() {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    } else if (this.video !== document.pictureInPictureElement) {
      this.video.requestPictureInPicture();
    }
  }

  updateQualityTracks() {
    const selector = document.getElementById('quality-selector');
    selector.innerHTML = '<option value="-1">Auto Quality</option>';
    
    if (!this.hls) return;
    
    this.hls.levels.forEach((level, index) => {
      const opt = document.createElement('option');
      opt.value = index;
      opt.textContent = `${level.height}p (${Math.round(level.bitrate / 1000)} kbps)`;
      selector.appendChild(opt);
    });

    selector.onchange = (e) => {
      this.hls.currentLevel = parseInt(e.target.value, 10);
    };
  }

  updateAudioTracks() {
    const selector = document.getElementById('audio-selector');
    selector.innerHTML = '<option value="-1">Default Audio</option>';

    if (!this.hls) return;

    this.hls.audioTracks.forEach((track, index) => {
      const opt = document.createElement('option');
      opt.value = index;
      opt.textContent = track.name || `Track ${index + 1}`;
      selector.appendChild(opt);
    });

    selector.onchange = (e) => {
      this.hls.audioTrack = parseInt(e.target.value, 10);
    };
  }
}

window.VideoPlayer = VideoPlayer;
